export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { promptText, negatives } = req.body || {};

    if (!promptText || !promptText.trim()) {
      return res.status(400).json({ error: 'Falta promptText' });
    }

    const systemPrompt = `
You are an expert visual prompt engineer.

Return your answer ONLY in this exact plain-text format:

[JSONCONTEXTPROFILE]
Subject: ...
Camera: ...
Lighting: ...
Mood: ...
Palette: ...
AspectRatioDescription: ...

[MIDJOURNEY_ES]
...

[MIDJOURNEY_EN]
...

[DALLE_ES]
...

[DALLE_EN]
...

[SD_POSITIVE_EN]
...

[SD_NEGATIVE_EN]
...

[GEMINI_IMAGE_EN]
...

Do not use markdown code fences.
Do not return JSON.
Do not omit any section.
`;

    const userPrompt = `
INPUT:
${promptText}

NEGATIVOS:
${negatives || 'blurry, low quality, distorted'}

Generate all sections completely.
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
        model: 'openrouter/free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.4,
        max_tokens: 1800
      })
    });

    const data = await response.json();
    console.log('OPENROUTER RESPONSE:', JSON.stringify(data));

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Error OpenRouter',
        details: data
      });
    }

    const raw = data?.choices?.[0]?.message?.content;

    let text = '';
    if (typeof raw === 'string') {
      text = raw;
    } else if (Array.isArray(raw)) {
      text = raw.map(part => part?.text || '').join('\n');
    } else if (raw && typeof raw === 'object') {
      text = raw.text || '';
    }

    if (!text.trim()) {
      return res.status(500).json({
        error: 'Respuesta vacía del modelo',
        details: data
      });
    }

    function getSection(label, nextLabels) {
      const startTag = `[${label}]`;
      const start = text.indexOf(startTag);
      if (start === -1) return '';

      const contentStart = start + startTag.length;
      let end = text.length;

      for (const next of nextLabels) {
        const idx = text.indexOf(`[${next}]`, contentStart);
        if (idx !== -1 && idx < end) end = idx;
      }

      return text.slice(contentStart, end).trim();
    }

    const jsonProfileRaw = getSection('JSONCONTEXTPROFILE', [
      'MIDJOURNEY_ES',
      'MIDJOURNEY_EN',
      'DALLE_ES',
      'DALLE_EN',
      'SD_POSITIVE_EN',
      'SD_NEGATIVE_EN',
      'GEMINI_IMAGE_EN'
    ]);

    function pickLine(label) {
      const regex = new RegExp(`${label}:\\s*(.*)`, 'i');
      const match = jsonProfileRaw.match(regex);
      return match ? match[1].trim() : 'No definido';
    }

    const result = {
      jsoncontextprofile: {
        Subject: pickLine('Subject'),
        Camera: pickLine('Camera'),
        Lighting: pickLine('Lighting'),
        Mood: pickLine('Mood'),
        Palette: pickLine('Palette'),
        AspectRatioDescription: pickLine('AspectRatioDescription')
      },
      midjourneyes: getSection('MIDJOURNEY_ES', [
        'MIDJOURNEY_EN',
        'DALLE_ES',
        'DALLE_EN',
        'SD_POSITIVE_EN',
        'SD_NEGATIVE_EN',
        'GEMINI_IMAGE_EN'
      ]) || 'Sin contenido generado',
      midjourneyen: getSection('MIDJOURNEY_EN', [
        'DALLE_ES',
        'DALLE_EN',
        'SD_POSITIVE_EN',
        'SD_NEGATIVE_EN',
        'GEMINI_IMAGE_EN'
      ]) || 'No content generated',
      dallees: getSection('DALLE_ES', [
        'DALLE_EN',
        'SD_POSITIVE_EN',
        'SD_NEGATIVE_EN',
        'GEMINI_IMAGE_EN'
      ]) || 'Sin contenido generado',
      dalleen: getSection('DALLE_EN', [
        'SD_POSITIVE_EN',
        'SD_NEGATIVE_EN',
        'GEMINI_IMAGE_EN'
      ]) || 'No content generated',
      sdpositiveen: getSection('SD_POSITIVE_EN', [
        'SD_NEGATIVE_EN',
        'GEMINI_IMAGE_EN'
      ]) || 'No content generated',
      sdnegativeen: getSection('SD_NEGATIVE_EN', [
        'GEMINI_IMAGE_EN'
      ]) || negatives || 'blurry, low quality, distorted',
      geminiimageen: getSection('GEMINI_IMAGE_EN', []) || 'No content generated'
    };

    return res.status(200).json(result);
  } catch (error) {
    console.log('SERVER ERROR:', error.message);
    return res.status(500).json({
      error: 'Fallo interno del servidor',
      details: error.message
    });
  }
}
