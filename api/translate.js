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
    const models = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];
    let result = null;
    let lastErr = null;

    const systemPrompt = `You are Abrevia's Bilingual Self-Correcting Grammar & Translation Engine.
Rules:
1. ALWAYS detect and auto-correct any typos, misspellings, phonetic errors, missing accents, colloquial abbreviations, missing punctuation, capitalization, and grammatical mistakes in the input text.
2. Produce a natural, professional, grammatically immaculate translation into ${targetLang}.
3. Return ONLY a valid JSON object with:
   - "correctedDraft": the clean, properly spelled, capitalized and punctuated version of the input text in its original language.
   - "translated": the pristine, natural, professionally translated text in ${targetLang}.
Return raw JSON only, no markdown fences, no explanations.`;

    for (const model of models) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemPrompt }]
            },
            contents: [{ parts: [{ text }] }],
            generationConfig: { responseMimeType: 'application/json' }
          }),
          signal: AbortSignal.timeout(3500)
        });

        const data = await response.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (response.ok && raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.translated) {
              result = {
                translated: parsed.translated.trim(),
                correctedDraft: (parsed.correctedDraft || text).trim(),
                original: text
              };
              break;
            }
          } catch (jsonErr) {
            // Fallback if model returned plain string
            result = {
              translated: raw.trim(),
              correctedDraft: text,
              original: text
            };
            break;
          }
        } else {
          lastErr = data.error?.message || 'Model call failed';
        }
      } catch (e) {
        lastErr = e.message;
      }
    }

    if (result) {
      res.status(200).json(result);
    } else {
      res.status(500).json({ error: lastErr || 'Translation failed' });
    }
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ error: 'Translation failed: ' + error.message });
  }
}
