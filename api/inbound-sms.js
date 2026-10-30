import { supabase } from '../lib/supabase.js';
import { decryptMessage } from '../lib/cipher.js';
import { saveContact, normalizePhone } from '../lib/contacts.js';
import { translateSpanishToEnglish } from '../lib/translate-helper.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      service: 'Abrevia Inbound SMS Webhook',
      status: 'operational',
      endpoint: '/api/inbound-sms',
      timestamp: new Date().toISOString()
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const payload = req.body || {};
  const isTextBee = payload.webhookEvent === 'MESSAGE_RECEIVED' || Boolean(payload.smsId);
  const eventType = req.headers['x-event-type'] || payload.event_type || payload.type;
  
  // Accept message.phone.received, TextBee MESSAGE_RECEIVED, or allow if simulation
  if (eventType && eventType !== 'message.phone.received' && !isTextBee) {
    return res.status(200).json({ success: true, ignored: true, reason: 'Event type not message.phone.received or TextBee MESSAGE_RECEIVED' });
  }

  const rawPhone = payload.sender || payload.from || payload.senderPhoneNumber || payload.phone || payload.phoneNumber || payload.data?.contact || payload.data?.from || payload.data?.phone_number;
  let inboundContent = payload.message || payload.text || payload.content || payload.data?.content || payload.data?.message || payload.data?.text;

  if (!rawPhone || !inboundContent) {
    console.warn('Inbound SMS missing contact or content:', payload);
    return res.status(400).json({ error: 'Missing contact or content in payload' });
  }

  const customerPhone = normalizePhone(String(rawPhone));

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
    // 1. Bidirectional translation & detection via shared Gemini translation pipeline
    const translationResult = await translateSpanishToEnglish(inboundContent);
    const englishText = translationResult.englishText || inboundContent;
    const spanishText = translationResult.spanishText || inboundContent;

    // 2. Save to Supabase
    let ticketId = null;
    let messageId = null;
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
        // Auto-save sender as contact and handle carrier compliance opt-out / opt-in
        try {
          const upper = inboundContent.trim().toUpperCase();
          const isOptOut = /^(STOP|ALTO|CANCEL|BAJA|UNSUBSCRIBE|QUIT|END)$/i.test(upper);
          const isOptIn = /^(START|UNSTOP|REANUDAR|INICIAR)$/i.test(upper);
          
          const contactUpdate = { phone: customerPhone };
          if (isOptOut) contactUpdate.opted_out = true;
          if (isOptIn) contactUpdate.opted_out = false;

          await saveContact(contactUpdate);
        } catch (cErr) {
          console.warn('Inbound SMS auto-save contact error:', cErr.message);
        }

        const { data: savedMsg, error: msgErr } = await supabase
          .from('messages')
          .insert({
            ticket_id: ticketId,
            sender: 'customer',
            english_text: englishText,
            spanish_text: spanishText
          })
          .select()
          .single();

        if (msgErr) {
          console.error('Error inserting inbound message:', msgErr);
        } else {
          messageId = savedMsg?.id;
        }
      }
    }

    // 3. Send final 200 OK after async work is completed
    return res.status(200).json({
      success: true,
      received: true,
      ticketId,
      messageId,
      sender: customerPhone,
      translated: englishText,
      provider: translationResult.provider
    });
  } catch (err) {
    console.error('Error processing inbound SMS webhook:', err);
    return res.status(500).json({ error: 'Processing error: ' + err.message });
  }
}
