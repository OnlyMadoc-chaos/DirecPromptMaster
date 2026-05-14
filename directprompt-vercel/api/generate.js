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
ACT AS World-class AI Visual Director & Prompt Engineer "Prompt Maestro System v3.0".

PHILOSOPHY:
Based on Protocols 1.0, 2.0 & 3.0

1. Technical Precision:
Always use specific lenses (85mm, 35mm), aperture (f/1.8), ISO, Global Illumination, and Ray Tracing.

2. Aspect Ratio Strategy:
Influence the composition based on the Aspect Ratio provided. Vertical for Stories/Reels, Wide for Cinema.

3. Model Specific Syntax:
- Midjourney: Integrate --ar RATIO, --v 6.0, --style raw, --s 250 naturally.
- Stable Diffusion: Weights like masterpiece:1.3. Massive NEGATIVE prompt required.
- DALL-E 3: Poetic narrative, purely affirmative.
- Nano Banana / Gemini-style field: Direct, concise, object-oriented prompts.

OUTPUT:
Return ONLY a valid JSON object with this exact structure:
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

Genera el protocolo completo y devuelve SOLO JSON válido.
`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://tu-dominio-vercel.vercel.app',
        'X-OpenRouter-Title': 'DirecPrompt'
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        messages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Error OpenRouter',
        details: data
      });
    }

    const raw = data?.choices?.[0]?.message?.content;

    if (!raw) {
      return res.status(500).json({ error: 'OpenRouter no devolvió contenido' });
    }

    let parsed;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      return res.status(500).json({
        error: 'La respuesta no vino en JSON válido',
        raw
      });
    }

    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({
      error: 'Fallo interno del servidor',
      details: error.message
    });
  }
}