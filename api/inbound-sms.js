import { supabase } from './lib/supabase.js';
import { decryptMessage } from './lib/cipher.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const payload = req.body || {};
  const eventType = req.headers['x-event-type'] || payload.event_type || payload.type;
  
  // Accept message.phone.received or allow if not specified in simulation
  if (eventType && eventType !== 'message.phone.received') {
    return res.status(200).json({ ignored: true, reason: 'Event type not message.phone.received' });
  }

  const customerPhone = payload.data?.contact || payload.data?.from || payload.data?.phone_number;
  let inboundContent = payload.data?.content || payload.data?.message || payload.data?.text;

  if (!customerPhone || !inboundContent) {
    console.warn('Inbound SMS missing contact or content:', payload);
    return res.status(400).json({ error: 'Missing contact or content in payload' });
  }

  // httpSMS End-to-End Encryption Decryption
  const encryptionKey = process.env.HTTPSMS_ENCRYPTION_KEY;
  const isPayloadEncrypted = payload.data?.encrypted === true || payload.encrypted === true;

  if (encryptionKey && (isPayloadEncrypted || (typeof inboundContent === 'string' && /^[A-Za-z0-9+/=]{24,}$/.test(inboundContent.trim())))) {
    const decrypted = decryptMessage(encryptionKey.trim(), inboundContent.trim());
    if (decrypted && decrypted.length > 0) {
      console.log(`[httpSMS E2EE] Successfully decrypted inbound message from ${customerPhone}`);
      inboundContent = decrypted;
    }
  }

  try {
    // 1. Bidirectional translation & detection via Gemini
    let englishText = inboundContent;
    let spanishText = inboundContent;
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
                parts: [{ text: 'You are a bilingual SMS relay assistant. Detect whether the message is in Spanish or English. Return a JSON object with: "detected" ("es" or "en"), "english" (the message in English), "spanish" (the message in Spanish). Return ONLY raw valid JSON.' }]
              },
              contents: [{ parts: [{ text: inboundContent }] }],
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

    // 2. Save to Supabase
    let ticketId = null;
    if (supabase) {
      // Find or create active ticket for this customer
      const { data: existingTicket, error: ticketErr } = await supabase
        .from('tickets')
        .select('id')
        .eq('customer_phone', customerPhone)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ticketErr) {
        console.error('Error fetching ticket:', ticketErr);
      }

      ticketId = existingTicket?.id;
      if (!ticketId) {
        const { data: newTicket, error: createErr } = await supabase
          .from('tickets')
          .insert({
            customer_phone: customerPhone,
            status: 'active'
          })
          .select('id')
          .single();

        if (createErr) {
          console.error('Error creating new ticket:', createErr);
        } else {
          ticketId = newTicket?.id;
        }
      }

      if (ticketId) {
        const { error: msgErr } = await supabase
          .from('messages')
          .insert({
            ticket_id: ticketId,
            sender: 'customer',
            english_text: englishText,
            spanish_text: spanishText
          });

        if (msgErr) {
          console.error('Error inserting inbound message:', msgErr);
        }
      }
    }

    // 3. Send final 200 OK after async work is completed
    return res.status(200).json({ received: true, ticketId, translated: englishText });
  } catch (err) {
    console.error('Error processing inbound SMS webhook:', err);
    return res.status(500).json({ error: 'Processing error: ' + err.message });
  }
}
