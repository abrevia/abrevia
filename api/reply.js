import { supabase } from '../lib/supabase.js';
import { saveContact } from '../lib/contacts.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticketId, message, senderName, action } = req.body || {};

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase is not configured' });
  }

  if (!ticketId) {
    return res.status(400).json({ error: 'Missing ticketId' });
  }

  try {
    // 1. Fetch ticket to verify existence and get customer phone
    const { data: ticket, error: ticketErr } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (ticketErr || !ticket) {
      return res.status(404).json({ error: 'Conversation ticket not found' });
    }

    const customerPhone = ticket.customer_phone;

    // Handle 1-Tap Opt-Out Action
    if (action === 'optout') {
      try {
        await saveContact({
          phone: customerPhone,
          opted_out: true
        });

        // Insert system notice into ticket thread
        await supabase.from('messages').insert({
          ticket_id: ticketId,
          sender: 'system',
          english_text: '🚫 Recipient has opted out of messaging (via web link).',
          spanish_text: '🚫 El destinatario ha cancelado la recepción de mensajes (vía enlace web).'
        });
      } catch (optErr) {
        console.warn('Error saving opt-out:', optErr.message);
      }

      return res.status(200).json({ 
        success: true, 
        optedOut: true, 
        message: 'Opt-out registered successfully' 
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message body cannot be empty' });
    }

    const text = message.trim();

    // Check for carrier opt-out keywords
    const upper = text.toUpperCase();
    const isOptOut = /^(STOP|ALTO|CANCEL|BAJA|UNSUBSCRIBE|QUIT|END)$/i.test(upper);
    const isOptIn = /^(START|UNSTOP|REANUDAR|INICIAR)$/i.test(upper);

    if (isOptOut || isOptIn) {
      try {
        await saveContact({
          phone: customerPhone,
          opted_out: isOptOut
        });
      } catch (cErr) {
        console.warn('Error updating contact opt-out status:', cErr.message);
      }
    }

    // 2. Bidirectional translation with Gemini
    let englishText = text;
    let spanishText = text;
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      const models = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];
      for (const model of models) {
        try {
          const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: 'You are Abrevia\'s Bilingual Self-Correcting SMS Relay. Always auto-correct all misspellings, typos, SMS shorthand/abbreviations, phonetic errors, missing accents, and grammatical mistakes in the inbound text. Detect whether the message is in Spanish or English. Return a JSON object with: "detected" ("es" or "en"), "english" (the clean, grammatically correct and polished message in English), "spanish" (the clean, grammatically correct and polished message in Spanish). Return ONLY raw valid JSON.' }]
              },
              contents: [{ parts: [{ text: text }] }],
              generationConfig: { responseMimeType: 'application/json' }
            }),
            signal: AbortSignal.timeout(3000)
          });

          const geminiData = await geminiRes.json();
          const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.english) englishText = parsed.english.trim();
            if (parsed.spanish) spanishText = parsed.spanish.trim();
            break;
          }
        } catch (transErr) {
          console.error(`Gemini translation error with ${model}:`, transErr);
        }
      }
    }

    // 3. Insert into Supabase messages
    const { data: insertedMsg, error: insertErr } = await supabase
      .from('messages')
      .insert({
        ticket_id: ticketId,
        sender: 'customer',
        english_text: englishText,
        spanish_text: spanishText
      })
      .select()
      .single();

    if (insertErr) {
      console.error('Supabase message insert error:', insertErr);
      return res.status(500).json({ error: 'Failed to record reply: ' + insertErr.message });
    }

    return res.status(200).json({
      success: true,
      message: insertedMsg,
      optedOut: isOptOut
    });
  } catch (err) {
    console.error('Recipient reply processing error:', err);
    return res.status(500).json({ error: 'Server error processing reply: ' + err.message });
  }
}
