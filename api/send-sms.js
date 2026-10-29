import { supabase } from '../lib/supabase.js';
import { encryptMessage } from '../lib/cipher.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { to, body, mediaUrl, ticketId, englishText, spanishText } = req.body || {};

  if (!to || !body) {
    return res.status(400).json({ error: 'Missing recipient phone number (to) or message body' });
  }

  const textbeeApiKey = process.env.TEXTBEE_API_KEY || 'txb_5RMV0hqGHk6HUFNiWPnnXdcGBV9lwku9';
  const textbeeDeviceId = process.env.TEXTBEE_DEVICE_ID || '6ae2b0b6c1ee0a8dec389241';
  const httpsmsApiKey = process.env.HTTPSMS_API_KEY;
  const fromPhone = process.env.HTTPSMS_PHONE_NUMBER;
  const encryptionKey = process.env.HTTPSMS_ENCRYPTION_KEY;

  if (!textbeeApiKey && (!httpsmsApiKey || !fromPhone)) {
    return res.status(500).json({ error: 'SMS Gateway (TextBee or httpSMS) is not configured' });
  }

  try {
    let sendResult = null;
    let provider = 'textbee';

    if (textbeeApiKey) {
      // 1. Send via TextBee Android SIM Gateway
      const textbeeUrl = textbeeDeviceId 
        ? `https://api.textbee.dev/api/v1/gateway/devices/${textbeeDeviceId}/send-sms`
        : 'https://api.textbee.dev/api/v1/gateway/send-sms';

      const outboundText = mediaUrl ? `${body}\n\n📎 Attachment: ${mediaUrl}` : body;

      const response = await fetch(textbeeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': textbeeApiKey
        },
        body: JSON.stringify({
          recipients: [to],
          message: outboundText
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('TextBee Error response:', errText);
        throw new Error(`TextBee returned status ${response.status}: ${errText}`);
      }
      sendResult = await response.json();
    } else {
      // 2. Fallback to httpSMS
      provider = 'httpsms';
      const isEncrypted = Boolean(encryptionKey && encryptionKey.trim().length > 0);
      const contentToSend = isEncrypted ? encryptMessage(encryptionKey.trim(), body) : body;

      const requestPayload = {
        content: contentToSend,
        from: fromPhone,
        to: to,
        attachments: mediaUrl ? [mediaUrl] : []
      };
      if (isEncrypted) requestPayload.encrypted = true;

      const response = await fetch('https://api.httpsms.com/v1/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': httpsmsApiKey
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('httpSMS Error response:', errText);
        throw new Error(`httpSMS returned status ${response.status}: ${errText}`);
      }
      sendResult = await response.json();
    }

    // Save outbound message to Supabase if ticketId is present
    let savedMessage = null;
    if (supabase && ticketId) {
      const finalEnglish = mediaUrl 
        ? `${englishText || body}\n\n📎 Attachment: ${mediaUrl}`
        : (englishText || body);
      const finalSpanish = mediaUrl
        ? `${spanishText || body}\n\n📎 Adjunto: ${mediaUrl}`
        : (spanishText || body);

      const { data, error } = await supabase
        .from('messages')
        .insert({
          ticket_id: ticketId,
          sender: 'agent',
          english_text: finalEnglish,
          spanish_text: finalSpanish
        })
        .select()
        .single();

      if (error) {
        console.error('Supabase message insert error:', error);
      } else {
        savedMessage = data;
      }
    }

    res.status(200).json({ 
      success: true, 
      provider: provider, 
      details: sendResult, 
      message: savedMessage 
    });
  } catch (error) {
    console.error('Failed to send SMS:', error);
    res.status(500).json({ error: 'Failed to send SMS: ' + error.message });
  }
}
