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

Your task is to generate prompt outputs for image models.

You MUST return ONLY valid JSON.
Do not use markdown.
Do not wrap in triple backticks.
Do not add explanations.

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

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://direc-prompt-master.vercel.app',
        'X-OpenRouter-Title': 'DirecPrompt'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.2-3b-instruct:free',
        messages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.4,
        max_tokens: 1800
      })
    });

    const data = await response.json();
    console.log('OPENROUTER RAW RESPONSE:', JSON.stringify(data));

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Error OpenRouter',
        details: data
      });
    }

    const raw = data?.choices?.[0]?.message?.content;

    if (!raw) {
      return res.status(500).json({
        error: 'OpenRouter no devolvió contenido',
        details: data
      });
    }

    let cleaned = raw.trim();

    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json/, '').trim();
    }
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```/, '').trim();
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.replace(/```$/, '').trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.log('RAW CONTENT THAT FAILED TO PARSE:', cleaned);
      return res.status(500).json({
        error: 'La respuesta no vino en JSON válido',
        raw: cleaned
      });
    }

    const normalized = {
      jsoncontextprofile: {
        Subject: parsed?.jsoncontextprofile?.Subject || 'No definido',
        Camera: parsed?.jsoncontextprofile?.Camera || 'No definido',
        Lighting: parsed?.jsoncontextprofile?.Lighting || 'No definido',
        Mood: parsed?.jsoncontextprofile?.Mood || 'No definido',
        Palette: parsed?.jsoncontextprofile?.Palette || 'No definido',
        AspectRatioDescription: parsed?.jsoncontextprofile?.AspectRatioDescription || 'No definido'
      },
      midjourneyes: parsed?.midjourneyes || 'Sin contenido generado',
      midjourneyen: parsed?.midjourneyen || 'No content generated',
      dallees: parsed?.dallees || 'Sin contenido generado',
      dalleen: parsed?.dalleen || 'No content generated',
      sdpositiveen: parsed?.sdpositiveen || 'No content generated',
      sdnegativeen: parsed?.sdnegativeen || 'No content generated',
      geminiimageen: parsed?.geminiimageen || 'No content generated'
    };

    return res.status(200).json(normalized);
  } catch (error) {
    console.log('SERVER ERROR:', error.message);
    return res.status(500).json({
      error: 'Fallo interno del servidor',
      details: error.message
    });
  }
}