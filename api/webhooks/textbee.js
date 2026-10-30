import { supabase } from '../../lib/supabase.js';
import { normalizePhone, saveContact } from '../../lib/contacts.js';
import { translateSpanishToEnglish } from '../../lib/translate-helper.js';

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

  // 2. Validate Event Type (Accept MESSAGE_RECEIVED, or allow direct payload)
  const eventType = payload.webhookEvent || payload.event || payload.type || req.headers['x-event-type'];
  if (eventType && eventType !== 'MESSAGE_RECEIVED' && eventType !== 'message.phone.received') {
    return res.status(200).json({
      success: true,
      ignored: true,
      reason: `Event type '${eventType}' ignored (only MESSAGE_RECEIVED processed)`
    });
  }

  // 3. Extract Data: sender phone, message content, and timestamp
  const rawSender = payload.sender || payload.from || payload.senderPhoneNumber || payload.phone || payload.phoneNumber || payload.data?.contact || payload.data?.from || payload.data?.phone_number;
  const rawContent = payload.message || payload.text || payload.content || payload.data?.message || payload.data?.text || payload.data?.content;
  const receivedTimestamp = payload.receivedAt || payload.timestamp || payload.createdAt || new Date().toISOString();

  if (!rawSender || !rawContent) {
    console.warn('[Textbee Webhook] Missing sender or message content:', payload);
    return res.status(400).json({ error: 'Missing sender or message content in request body' });
  }

  const normalizedPhone = normalizePhone(String(rawSender));
  const inboundMessage = String(rawContent).trim();

  if (!normalizedPhone || !inboundMessage) {
    return res.status(400).json({ error: 'Invalid phone number or empty message body' });
  }

  if (!supabase) {
    console.error('[Textbee Webhook] Supabase client is not configured');
    return res.status(500).json({ error: 'Database client unconfigured' });
  }

  try {
    // 4. Resolve Active Ticket in Supabase
    let ticketId = null;
    const { data: existingTicket, error: ticketErr } = await supabase
      .from('tickets')
      .select('id, customer_phone, status')
      .eq('customer_phone', normalizedPhone)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ticketErr) {
      console.warn('[Textbee Webhook] Error querying existing ticket:', ticketErr.message);
    }

    if (existingTicket?.id) {
      ticketId = existingTicket.id;
    } else {
      // Create new ticket using existing schema
      const { data: newTicket, error: createErr } = await supabase
        .from('tickets')
        .insert({
          customer_phone: normalizedPhone,
          status: 'active'
        })
        .select('id, customer_phone, status')
        .single();

      if (createErr) {
        console.error('[Textbee Webhook] Error creating new ticket:', createErr.message);
        return res.status(500).json({ error: 'Failed to create conversation ticket: ' + createErr.message });
      }
      ticketId = newTicket.id;
    }

    // 5. Auto-save contact and handle carrier opt-out / opt-in compliance
    try {
      const upper = inboundMessage.toUpperCase();
      const isOptOut = /^(STOP|ALTO|CANCEL|BAJA|UNSUBSCRIBE|QUIT|END)$/i.test(upper);
      const isOptIn = /^(START|UNSTOP|REANUDAR|INICIAR)$/i.test(upper);

      const contactUpdate = { phone: normalizedPhone };
      if (isOptOut) contactUpdate.opted_out = true;
      if (isOptIn) contactUpdate.opted_out = false;
      await saveContact(contactUpdate);
    } catch (cErr) {
      console.warn('[Textbee Webhook] Auto-save contact note:', cErr.message);
    }

    // 6. Translate Inbound Spanish -> English via existing Gemini pipeline
    const translationResult = await translateSpanishToEnglish(inboundMessage);
    const englishText = translationResult.englishText || inboundMessage;
    const spanishText = translationResult.spanishText || inboundMessage;

    // 7. Persist Message into Supabase messages table
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
      console.error('[Textbee Webhook] Error inserting message:', msgErr.message);
      return res.status(500).json({ error: 'Failed to persist message: ' + msgErr.message });
    }

    // 8. Return 200 OK JSON response to acknowledge Textbee
    return res.status(200).json({
      success: true,
      direction: 'inbound',
      ticketId: ticketId,
      messageId: savedMsg?.id,
      sender: normalizedPhone,
      spanish: spanishText,
      english: englishText,
      provider: translationResult.provider
    });
  } catch (err) {
    console.error('[Textbee Webhook Fatal]:', err);
    return res.status(500).json({ error: 'Internal processing error: ' + err.message });
  }
}
