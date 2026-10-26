import { supabase } from './lib/supabase.js';

export default async function handler(req, res) {
  // 1. IMMEDIATE ACK (httpSMS requires a response within 5 seconds)
  res.status(200).json({ received: true });

  const eventType = req.headers['x-event-type'];
  if (eventType !== 'message.phone.received') {
    return;
  }

  const payload = req.body || {};
  const customerPhone = payload.data?.contact;
  const spanishText = payload.data?.content;

  if (!customerPhone || !spanishText) {
    console.warn('Inbound SMS missing contact or content:', payload);
    return;
  }

  try {
    // 2. Translate to English via Gemini 1.5 Flash
    let englishText = spanishText;
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
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
    }

    // 3. Save to Supabase
    if (supabase) {
      // Find or create active ticket for this customer
      let { data: ticket, error: ticketErr } = await supabase
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

      let ticketId = ticket?.id;
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
  } catch (err) {
    console.error('Error processing inbound SMS webhook:', err);
  }
}
