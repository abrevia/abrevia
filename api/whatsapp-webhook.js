import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  // 1. Meta Webhook Verification (GET)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'abrevia_webhook_secret';

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[WhatsApp Webhook] Verification successful');
      return res.status(200).send(challenge);
    } else {
      console.warn('[WhatsApp Webhook] Verification failed. Token mismatch.');
      return res.status(403).json({ error: 'Verification token mismatch' });
    }
  }

  // 2. Incoming WhatsApp Message Handler (POST)
  if (req.method === 'POST') {
    try {
      const body = req.body;
      if (!body || body.object !== 'whatsapp_business_account') {
        return res.status(200).json({ status: 'ignored' });
      }

      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      if (!message) {
        // Status update (sent, delivered, read receipt)
        return res.status(200).json({ status: 'receipt_acknowledged' });
      }

      const senderPhone = '+' + String(message.from).replace(/^\+/, '');
      const senderName = value?.contacts?.[0]?.profile?.name || senderPhone;
      let incomingText = '';

      if (message.type === 'text') {
        incomingText = message.text?.body || '';
      } else if (message.type === 'image') {
        incomingText = message.image?.caption || '[Imagen de WhatsApp]';
      } else if (message.type === 'audio') {
        incomingText = '[Nota de voz de WhatsApp]';
      } else {
        incomingText = `[Mensaje ${message.type}]`;
      }

      console.log(`[WhatsApp Inbound] From: ${senderPhone} (${senderName}): "${incomingText}"`);

      // Translate Spanish -> English for Point A (Abrevia operator)
      let translatedEnglish = incomingText;
      try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey && incomingText) {
          const transRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{ text: `Translate the following Spanish message accurately and professionally into English. Return ONLY the English translation without preamble or quotes:\n\n${incomingText}` }]
              }]
            }),
            signal: AbortSignal.timeout(5000)
          });
          const transData = await transRes.json();
          const translated = transData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (translated) translatedEnglish = translated.trim();
        }
      } catch (transErr) {
        console.warn('[WhatsApp Inbound] Translation warning:', transErr.message);
      }

      // Find or create ticket in Supabase
      if (supabase) {
        // Look for open ticket with this phone
        let { data: ticket } = await supabase
          .from('tickets')
          .select('id, customer_name, status')
          .eq('customer_phone', senderPhone)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!ticket) {
          // Create new ticket
          const { data: newTicket, error: createErr } = await supabase
            .from('tickets')
            .insert({
              customer_name: senderName,
              customer_phone: senderPhone,
              status: 'open',
              channel: 'whatsapp'
            })
            .select()
            .single();

          if (!createErr) ticket = newTicket;
        }

        if (ticket) {
          // Insert bilingual message
          await supabase.from('messages').insert({
            ticket_id: ticket.id,
            sender: 'client',
            spanish_text: incomingText,
            english_text: translatedEnglish,
            channel: 'whatsapp',
            meta_message_id: message.id
          });
        }
      }

      return res.status(200).json({ status: 'success', translated: translatedEnglish });
    } catch (err) {
      console.error('[WhatsApp Webhook Error]:', err);
      // Always return 200 to Meta so it does not retry endlessly
      return res.status(200).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
