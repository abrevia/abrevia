import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    to,
    message,
    ticketId,
    englishText,
    spanishText,
    forceSmsFallback = false
  } = req.body || {};

  if (!to || (!message && !spanishText && !englishText)) {
    return res.status(400).json({ error: 'Missing recipient phone (to) or message body' });
  }

  const cleanPhone = String(to).replace(/[^\d+]/g, '');
  const finalSpanishText = spanishText || message;
  const finalEnglishText = englishText || message;

  const whatsappToken = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  // If WhatsApp credentials exist and not forcing SMS fallback, attempt WhatsApp Cloud API dispatch
  if (whatsappToken && phoneNumberId && !forceSmsFallback) {
    try {
      const recipientWaId = cleanPhone.replace(/^\+/, '');
      const metaUrl = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

      const metaRes = await fetch(metaUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${whatsappToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientWaId,
          type: 'text',
          text: {
            preview_url: false,
            body: finalSpanishText
          }
        })
      });

      const metaData = await metaRes.json();

      if (metaRes.ok && metaData.messages?.[0]?.id) {
        // Record in Supabase
        if (supabase && ticketId) {
          await supabase.from('messages').insert({
            ticket_id: ticketId,
            sender: 'agent',
            english_text: finalEnglishText,
            spanish_text: finalSpanishText,
            channel: 'whatsapp',
            meta_message_id: metaData.messages[0].id
          });
        }

        return res.status(200).json({
          success: true,
          channel: 'whatsapp',
          messageId: metaData.messages[0].id,
          recipient: cleanPhone
        });
      } else {
        console.warn('[WhatsApp Send Warning] Meta returned error, falling back to SMS:', metaData);
      }
    } catch (waErr) {
      console.warn('[WhatsApp Send Exception] Falling back to SMS:', waErr.message);
    }
  }

  // Graceful Fallback: Dispatch via SMS (httpSMS / TextBee)
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'abrevia-beta.vercel.app';
    const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');

    const smsRes = await fetch(`${proto}://${host}/api/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: cleanPhone,
        body: finalSpanishText,
        englishText: finalEnglishText,
        spanishText: finalSpanishText,
        ticketId: ticketId,
        dispatchMode: 'direct'
      })
    });

    const smsData = await smsRes.json();
    return res.status(200).json({
      success: true,
      channel: 'sms (fallback)',
      details: smsData
    });
  } catch (smsErr) {
    return res.status(500).json({ error: 'Failed to dispatch via WhatsApp and SMS fallback: ' + smsErr.message });
  }
}
