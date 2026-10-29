import { isAwsTranslateConfigured, translateWithAws } from '../lib/aws-translate.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { text, targetLang = 'Spanish' } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Missing text to translate' });
  }

  const cleanText = text.trim();
  const targetCode = targetLang.toLowerCase().includes('en') ? 'en' : 'es';
  const sourceCode = targetCode === 'es' ? 'en' : 'es';

  // 1. If AWS Translate is configured, use AWS under HIPAA BAA
  if (isAwsTranslateConfigured()) {
    try {
      const awsResult = await translateWithAws(cleanText, sourceCode, targetCode);
      return res.status(200).json({
        translated: awsResult.translated,
        correctedDraft: cleanText,
        original: cleanText,
        provider: 'aws-translate-hipaa'
      });
    } catch (awsErr) {
      console.warn('[AWS Translate Warning] Falling back to Gemini:', awsErr.message);
    }
  }

  // 2. Google Gemini Neural Engine (Fast models with strict 2500ms timeout)
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    const models = ['gemini-3.1-flash-lite', 'gemini-3-flash-preview'];
    const systemPrompt = `You are Abrevia's Bilingual Self-Correcting Grammar & Translation Engine.
Rules:
1. Auto-correct typos, misspellings, colloquial abbreviations, missing punctuation, capitalization, and grammar in the input text.
2. Produce a natural, professional translation into ${targetLang}.
3. Return ONLY a valid JSON object with:
   - "correctedDraft": clean, properly spelled version of input text.
   - "translated": professional translation in ${targetLang}.
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
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: cleanText }] }],
            generationConfig: { responseMimeType: 'application/json' }
          }),
          signal: AbortSignal.timeout(2500)
        });

        if (response.ok) {
          const data = await response.json();
          const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (parsed.translated) {
                return res.status(200).json({
                  translated: parsed.translated.trim(),
                  correctedDraft: (parsed.correctedDraft || cleanText).trim(),
                  original: cleanText,
                  provider: 'gemini'
                });
              }
            } catch (jsonErr) {
              return res.status(200).json({
                translated: raw.trim(),
                correctedDraft: cleanText,
                original: cleanText,
                provider: 'gemini-raw'
              });
            }
          }
        }
      } catch (err) {
        console.warn(`[Gemini ${model} warning]:`, err.message);
      }
    }
  }

  // 3. High-Speed Fallback Translation (Google GTX - 150ms sub-second response)
  try {
    const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceCode}&tl=${targetCode}&dt=t&q=${encodeURIComponent(cleanText)}`;
    const gtxRes = await fetch(gtxUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(3000)
    });
    if (gtxRes.ok) {
      const gtxData = await gtxRes.json();
      if (Array.isArray(gtxData?.[0])) {
        const translatedParts = gtxData[0].map(part => part?.[0] || '').join('');
        if (translatedParts.trim()) {
          return res.status(200).json({
            translated: translatedParts.trim(),
            correctedDraft: cleanText,
            original: cleanText,
            provider: 'gtx-fallback'
          });
        }
      }
    }
  } catch (gtxErr) {
    console.warn('[GTX Fallback warning]:', gtxErr.message);
  }

  // 4. Safe Failover: Never block operator dispatch
  return res.status(200).json({
    translated: cleanText,
    correctedDraft: cleanText,
    original: cleanText,
    provider: 'passthrough'
  });
}
