export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { text, targetLang = 'Spanish' } = req.body || {};
  if (!text) {
    return res.status(400).json({ error: 'Missing text to translate' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not configured' });
  }

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: `Translate accurately to ${targetLang}. Return ONLY the translated string.` }]
        },
        contents: [{ parts: [{ text }] }]
      })
    });

    const data = await response.json();

    if (!response.ok || !data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
      console.error('Gemini API Error:', data);
      return res.status(500).json({ error: data.error?.message || 'Translation failed' });
    }

    const translated = data.candidates[0].content.parts[0].text.trim();
    res.status(200).json({ translated });
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ error: 'Translation failed: ' + error.message });
  }
}
