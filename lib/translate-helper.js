import { isAwsTranslateConfigured, translateWithAws } from './aws-translate.js';

/**
 * Shared translation engine for Abrevia.
 * Reuses Google Gemini neural translation models with fallback to Google GTX and passthrough.
 */
export async function translateSpanishToEnglish(spanishText) {
  if (!spanishText || typeof spanishText !== 'string' || !spanishText.trim()) {
    return { englishText: '', spanishText: '' };
  }

  const cleanText = spanishText.trim();
  let englishText = cleanText;
  let cleanSpanish = cleanText;

  // 1. AWS Translate (if configured for HIPAA BAA)
  if (isAwsTranslateConfigured()) {
    try {
      const awsRes = await translateWithAws(cleanText, 'es', 'en');
      if (awsRes?.translated) {
        return {
          englishText: awsRes.translated.trim(),
          spanishText: cleanText,
          provider: 'aws-translate-hipaa'
        };
      }
    } catch (e) {
      console.warn('[AWS Translate Warning]:', e.message);
    }
  }

  // 2. Google Gemini Neural Engine (Fast models with auto-correction)
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    const models = [
      'gemini-flash-lite-latest',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-3-flash-preview',
      'gemini-2.5-flash'
    ];

    const systemPrompt = `You are Abrevia's Bilingual Self-Correcting SMS Relay. Always auto-correct all misspellings, typos, SMS shorthand/abbreviations, phonetic errors, missing accents, and grammatical mistakes in the inbound text. Detect whether the message is in Spanish or English. Return a JSON object with: "detected" ("es" or "en"), "english" (the clean, grammatically correct and polished message in English), "spanish" (the clean, grammatically correct and polished message in Spanish). Return ONLY raw valid JSON.`;

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
          signal: AbortSignal.timeout(3500)
        });

        if (response.ok) {
          const geminiData = await response.json();
          const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (parsed.english) englishText = parsed.english.trim();
              if (parsed.spanish) cleanSpanish = parsed.spanish.trim();
              return {
                englishText,
                spanishText: cleanSpanish,
                provider: `gemini (${model})`
              };
            } catch (jsonErr) {
              return {
                englishText: raw.trim(),
                spanishText: cleanText,
                provider: `gemini-raw (${model})`
              };
            }
          }
        }
      } catch (err) {
        // Try next model if timeout or rate-limited
      }
    }
  }

  // 3. High-Speed Fallback Translation (Google GTX - 150ms sub-second response)
  try {
    const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=es&tl=en&dt=t&q=${encodeURIComponent(cleanText)}`;
    const gtxRes = await fetch(gtxUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(3000)
    });
    if (gtxRes.ok) {
      const gtxData = await gtxRes.json();
      if (Array.isArray(gtxData?.[0])) {
        const translatedParts = gtxData[0].map(part => part?.[0] || '').join('');
        if (translatedParts.trim()) {
          return {
            englishText: translatedParts.trim(),
            spanishText: cleanText,
            provider: 'gtx-fallback'
          };
        }
      }
    }
  } catch (gtxErr) {
    console.warn('[GTX Fallback warning]:', gtxErr.message);
  }

  // 4. Safe Passthrough
  return {
    englishText: cleanText,
    spanishText: cleanText,
    provider: 'passthrough'
  };
}
