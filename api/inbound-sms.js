import { supabase } from './lib/supabase.js';

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
  const spanishText = payload.data?.content || payload.data?.message || payload.data?.text;

  if (!customerPhone || !spanishText) {
    console.warn('Inbound SMS missing contact or content:', payload);
    return res.status(400).json({ error: 'Missing contact or content in payload' });
  }

  try {
    // 1. Translate to English via Gemini 1.5 Flash
    let englishText = spanishText;
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const geminiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: 'Translate accurately from Spanish to English. Return ONLY the translated English text with no extra commentary.' }]
            },
            contents: [{ parts: [{ text: spanishText }] }]
          })
        });

        const geminiData = await geminiRes.json();
        if (geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
          englishText = geminiData.candidates[0].content.parts[0].text.trim();
        }
      } catch (transErr) {
        console.error('Gemini translation error:', transErr);
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
