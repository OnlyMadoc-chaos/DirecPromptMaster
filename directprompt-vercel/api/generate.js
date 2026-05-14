export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { promptText, negatives } = req.body || {};

    if (!promptText || !promptText.trim()) {
      return res.status(400).json({ error: 'Falta promptText' });
    }

    const SYSTEM_INSTRUCTION = `
You are a world-class AI Visual Director and Prompt Engineer.

Return ONLY valid JSON.
No markdown.
No triple backticks.
No explanations.

Return this exact JSON structure:
{
  "jsoncontextprofile": {
    "Subject": "",
    "Camera": "",
    "Lighting": "",
    "Mood": "",
    "Palette": "",
    "AspectRatioDescription": ""
  },
  "midjourneyes": "",
  "midjourneyen": "",
  "dallees": "",
  "dalleen": "",
  "sdpositiveen": "",
  "sdnegativeen": "",
  "geminiimageen": ""
}
`;

    const userPrompt = `
INPUT:
${promptText}

NEGATIVOS:
${negatives || ''}

Generate all fields with rich, useful content.
Never leave fields empty.
Return only valid JSON.
`;

    const modelsToTry = [
      'openrouter/free',
      'meta-llama/llama-3.2-3b-instruct:free',
      'mistralai/mistral-7b-instruct:free',
      'google/gemma-2-9b-it:free'
    ];

    function extractTextContent(content) {
      if (!content) return '';
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content
          .map(part => {
            if (typeof part === 'string') return part;
            if (part?.type === 'text' && typeof part?.text === 'string') return part.text;
            if (typeof part?.text === 'string') return part.text;
            if (typeof part?.content === 'string') return part.content;
            return '';
          })
          .join('\n')
          .trim();
      }
      if (typeof content === 'object') {
        if (typeof content.text === 'string') return content.text;
        if (typeof content.content === 'string') return content.content;
      }
      return '';
    }

    function stripCodeFences(text) {
      let cleaned = (text || '').trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json/, '').trim();
      }
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```/, '').trim();
      }
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.replace(/```$/, '').trim();
      }
      return cleaned;
    }

    function tryParseJsonFromText(text) {
      const cleaned = stripCodeFences(text);

      try {
        return JSON.parse(cleaned);
      } catch (e) {}

      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const possibleJson = cleaned.slice(firstBrace, lastBrace + 1);
        try {
          return JSON.parse(possibleJson);
        } catch (e) {}
      }

      return null;
    }

    function normalizeParsed(parsed, rawText, promptText, negatives) {
      const fallbackBase = rawText || `Prompt base: ${promptText}`;

      const mjEs = parsed?.midjourneyes || fallbackBase;
      const mjEn = parsed?.midjourneyen || fallbackBase;
      const dalleEs = parsed?.dallees || fallbackBase;
      const dalleEn = parsed?.dalleen || fallbackBase;
      const sdPos = parsed?.sdpositiveen || fallbackBase;
      const sdNeg = parsed?.sdnegativeen || negatives || 'blurry, low quality, distorted';
      const gemini = parsed?.geminiimageen || fallbackBase;

      return {
        jsoncontextprofile: {
          Subject: parsed?.jsoncontextprofile?.Subject || promptText,
          Camera: parsed?.jsoncontextprofile?.Camera || 'cinematic composition',
          Lighting: parsed?.jsoncontextprofile?.Lighting || 'dramatic lighting',
          Mood: parsed?.jsoncontextprofile?.Mood || 'epic, atmospheric',
          Palette: parsed?.jsoncontextprofile?.Palette || 'high contrast cinematic palette',
          AspectRatioDescription: parsed?.jsoncontextprofile?.AspectRatioDescription || 'Adapted to selected aspect ratio'
        },
        midjourneyes: mjEs,
        midjourneyen: mjEn,
        dallees: dalleEs,
        dalleen: dalleEn,
        sdpositiveen: sdPos,
        sdnegativeen: sdNeg,
        geminiimageen: gemini
      };
    }

    let lastError = null;

    for (const model of modelsToTry) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://direc-prompt-master.vercel.app',
            'X-OpenRouter-Title': 'DirecPrompt'
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: SYSTEM_INSTRUCTION },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.4,
            max_tokens: 1800
          })
        });

        const data = await response.json();
        console.log(`MODEL ${model} RAW RESPONSE:`, JSON.stringify(data));

        if (!response.ok) {
          lastError = { model, status: response.status, data };
          continue;
        }

        const content = data?.choices?.[0]?.message?.content;
        const rawText = extractTextContent(content);

        console.log(`MODEL ${model} EXTRACTED TEXT:`, rawText);

        if (!rawText) {
          lastError = { model, error: 'Sin contenido extraíble', data };
          continue;
        }

        const parsed = tryParseJsonFromText(rawText);

        if (parsed) {
          const normalized = normalizeParsed(parsed, rawText, promptText, negatives);
          return res.status(200).json(normalized);
        }

        const fallbackNormalized = normalizeParsed({}, rawText, promptText, negatives);
        return res.status(200).json(fallbackNormalized);
      } catch (err) {
        console.log(`MODEL ${model} FETCH ERROR:`, err.message);
        lastError = { model, error: err.message };
      }
    }

    return res.status(500).json({
      error: 'Todos los modelos free fallaron',
      details: lastError
    });
  } catch (error) {
    console.log('SERVER ERROR:', error.message);
    return res.status(500).json({
      error: 'Fallo interno del servidor',
      details: error.message
    });
  }
}
