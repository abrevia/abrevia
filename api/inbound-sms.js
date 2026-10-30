import { supabase } from '../lib/supabase.js';
import { decryptMessage } from '../lib/cipher.js';
import { saveContact, normalizePhone } from '../lib/contacts.js';
import { translateSpanishToEnglish } from '../lib/translate-helper.js';

export default async function handler(req, res) {
  // 1. Healthcheck / Pre-flight Verification (GET)
  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      service: 'Abrevia Textbee Inbound SMS Webhook',
      status: 'operational',
      endpoint: '/api/webhooks/textbee',
      timestamp: new Date().toISOString()
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const payload = req.body || {};
  const isTextBee = payload.webhookEvent === 'MESSAGE_RECEIVED' || Boolean(payload.smsId);
  const eventType = payload.webhookEvent || payload.event || payload.type || req.headers['x-event-type'];

  // Accept TextBee MESSAGE_RECEIVED, httpSMS message.phone.received, or allow direct payload
  if (eventType && eventType !== 'MESSAGE_RECEIVED' && eventType !== 'message.phone.received' && !isTextBee) {
    return res.status(200).json({
      success: true,
      ignored: true,
      reason: `Event type '${eventType}' ignored (only MESSAGE_RECEIVED processed)`
    });
  }

  // 2. Extract Data: sender phone, message content, and timestamp
  const rawPhone = payload.sender || payload.from || payload.senderPhoneNumber || payload.phone || payload.phoneNumber || payload.data?.contact || payload.data?.from || payload.data?.phone_number;
  let inboundContent = payload.message || payload.text || payload.content || payload.data?.content || payload.data?.message || payload.data?.text;
  const receivedTimestamp = payload.receivedAt || payload.timestamp || payload.createdAt || new Date().toISOString();

  if (!rawPhone || !inboundContent) {
    console.warn('[Inbound SMS Webhook] Missing contact or content:', payload);
    return res.status(400).json({ error: 'Missing contact or content in payload' });
  }

  const customerPhone = normalizePhone(String(rawPhone));
  inboundContent = String(inboundContent).trim();

  if (!customerPhone || !inboundContent) {
    return res.status(400).json({ error: 'Invalid phone number or empty message content' });
  }

  // httpSMS End-to-End Encryption Decryption (if applicable)
  const encryptionKey = process.env.HTTPSMS_ENCRYPTION_KEY;
  const isPayloadEncrypted = payload.data?.encrypted === true || payload.encrypted === true;

  if (encryptionKey && (isPayloadEncrypted || (typeof inboundContent === 'string' && /^[A-Za-z0-9+/=]{24,}$/.test(inboundContent.trim())))) {
    const decrypted = decryptMessage(encryptionKey.trim(), inboundContent.trim());
    if (decrypted && decrypted.length > 0) {
      console.log(`[httpSMS E2EE] Successfully decrypted inbound message from ${customerPhone}`);
      inboundContent = decrypted;
    }
  }

  if (!supabase) {
    console.error('[Inbound SMS Webhook] Supabase client is not configured');
    return res.status(500).json({ error: 'Database client unconfigured' });
  }

  try {
    // 3. Resolve Active Ticket in Supabase
    let ticketId = null;
    let messageId = null;

    const { data: existingTicket, error: ticketErr } = await supabase
      .from('tickets')
      .select('id, customer_phone, status')
      .eq('customer_phone', customerPhone)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ticketErr) {
      console.warn('[Inbound SMS Webhook] Error fetching ticket:', ticketErr.message);
    }

    if (existingTicket?.id) {
      ticketId = existingTicket.id;
    } else {
      const { data: newTicket, error: createErr } = await supabase
        .from('tickets')
        .insert({
          customer_phone: customerPhone,
          status: 'active'
        })
        .select('id, customer_phone, status')
        .single();

      if (createErr) {
        console.error('[Inbound SMS Webhook] Error creating new ticket:', createErr.message);
        return res.status(500).json({ error: 'Failed to create conversation ticket: ' + createErr.message });
      }
      ticketId = newTicket.id;
    }

    // 4. Auto-save sender as contact and handle carrier compliance opt-out / opt-in
    try {
      const upper = inboundContent.toUpperCase();
      const isOptOut = /^(STOP|ALTO|CANCEL|BAJA|UNSUBSCRIBE|QUIT|END)$/i.test(upper);
      const isOptIn = /^(START|UNSTOP|REANUDAR|INICIAR)$/i.test(upper);

      const contactUpdate = { phone: customerPhone };
      if (isOptOut) contactUpdate.opted_out = true;
      if (isOptIn) contactUpdate.opted_out = false;

      await saveContact(contactUpdate);
    } catch (cErr) {
      console.warn('[Inbound SMS Webhook] Auto-save contact note:', cErr.message);
    }

    // 5. Translate Inbound Spanish -> English via shared Gemini translation pipeline
    const translationResult = await translateSpanishToEnglish(inboundContent);
    const englishText = translationResult.englishText || inboundContent;
    const spanishText = translationResult.spanishText || inboundContent;

    // 6. Persist Message into Supabase messages table
    // PostgreSQL check constraint enforces sender IN ('customer', 'agent').
    // 'customer' denotes incoming inbound message from recipient.
    const { data: savedMsg, error: msgErr } = await supabase
      .from('messages')
      .insert({
        ticket_id: ticketId,
        sender: 'customer',
        spanish_text: spanishText,
        english_text: englishText,
        created_at: receivedTimestamp
      })
      .select()
      .single();

    if (msgErr) {
      console.error('[Inbound SMS Webhook] Error inserting message:', msgErr.message);
      return res.status(500).json({ error: 'Failed to persist message: ' + msgErr.message });
    }
    messageId = savedMsg?.id;

    // 7. Acknowledge: Return 200 OK JSON response so Textbee knows message was received
    return res.status(200).json({
      success: true,
      direction: 'inbound',
      ticketId: ticketId,
      messageId: messageId,
      sender: customerPhone,
      spanish: spanishText,
      english: englishText,
      provider: translationResult.provider
    });
  } catch (err) {
    console.error('[Inbound SMS Webhook Fatal]:', err);
    return res.status(500).json({ error: 'Processing error: ' + err.message });
  }
}
