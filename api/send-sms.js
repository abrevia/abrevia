import { supabase } from '../lib/supabase.js';
import { encryptMessage } from '../lib/cipher.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { to, body, mediaUrl, ticketId, englishText, spanishText, provider: reqProvider } = req.body || {};

  if (!to || !body) {
    return res.status(400).json({ error: 'Missing recipient phone number (to) or message body' });
  }

  const httpsmsApiKey = process.env.HTTPSMS_API_KEY;
  const fromPhone = process.env.HTTPSMS_PHONE_NUMBER;
  const encryptionKey = process.env.HTTPSMS_ENCRYPTION_KEY;
  const textbeeApiKey = process.env.TEXTBEE_API_KEY || 'txb_5RMV0hqGHk6HUFNiWPnnXdcGBV9lwku9';
  const textbeeDeviceId = process.env.TEXTBEE_DEVICE_ID || '6ae2b0b6c1ee0a8dec389241';

  // Target provider: 'httpsms' (Default Production) vs 'textbee' (Testing Comparison)
  const selectedProvider = (reqProvider || req.query?.provider || process.env.SMS_PROVIDER || 'httpsms').toLowerCase();

  try {
    let sendResult = null;
    let usedProvider = selectedProvider;

    // Helper: Send via httpSMS
    const sendViaHttpSms = async () => {
      if (!httpsmsApiKey || !fromPhone) {
        throw new Error('httpSMS is not configured (missing HTTPSMS_API_KEY or HTTPSMS_PHONE_NUMBER)');
      }
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
        throw new Error(`httpSMS error ${response.status}: ${errText}`);
      }
      return await response.json();
    };

    // Helper: Send via TextBee
    const sendViaTextBee = async () => {
      if (!textbeeApiKey) {
        throw new Error('TextBee is not configured (missing TEXTBEE_API_KEY)');
      }
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
        throw new Error(`TextBee error ${response.status}: ${errText}`);
      }
      return await response.json();
    };

    // Execute with target provider, with graceful fallback to comparison gateway if requested
    if (selectedProvider === 'textbee') {
      try {
        sendResult = await sendViaTextBee();
        usedProvider = 'textbee';
      } catch (tbErr) {
        console.warn('TextBee failed, attempting fallback to httpSMS:', tbErr.message);
        sendResult = await sendViaHttpSms();
        usedProvider = 'httpsms (fallback)';
      }
    } else {
      // Default: httpSMS
      try {
        sendResult = await sendViaHttpSms();
        usedProvider = 'httpsms';
      } catch (httpErr) {
        if (textbeeApiKey) {
          console.warn('httpSMS failed, attempting fallback to TextBee:', httpErr.message);
          sendResult = await sendViaTextBee();
          usedProvider = 'textbee (fallback)';
        } else {
          throw httpErr;
        }
      }
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
      provider: usedProvider, 
      details: sendResult, 
      message: savedMessage 
    });
  } catch (error) {
    console.error('Failed to send SMS:', error);
    res.status(500).json({ error: 'Failed to send SMS: ' + error.message });
  }
}
