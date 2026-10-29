import { supabase } from '../lib/supabase.js';
import { encryptMessage } from '../lib/cipher.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { 
    to, 
    body, 
    mediaUrl, 
    ticketId, 
    englishText, 
    spanishText, 
    provider: reqProvider,
    orgName,
    senderName,
    targetLang = 'es',
    dispatchMode = 'link' // 'link' (MessageBee notification with link) vs 'direct'
  } = req.body || {};

  if (!to || !body) {
    return res.status(400).json({ error: 'Missing recipient phone number (to) or message body' });
  }

  const httpsmsApiKey = process.env.HTTPSMS_API_KEY;
  const fromPhone = process.env.HTTPSMS_PHONE_NUMBER;
  const encryptionKey = process.env.HTTPSMS_ENCRYPTION_KEY;
  const textbeeApiKey = process.env.TEXTBEE_API_KEY || 'txb_5RMV0hqGHk6HUFNiWPnnXdcGBV9lwku9';
  const textbeeDeviceId = process.env.TEXTBEE_DEVICE_ID || '6ae2b0b6c1ee0a8dec389241';

  // Construct Outbound SMS Text (Link Notification vs Direct SMS)
  let smsContentToSend = body;
  let messageLink = '';

  if (dispatchMode === 'link') {
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'abrevia-beta.vercel.app';
    const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
    messageLink = ticketId ? `${proto}://${host}/m.html?t=${ticketId}` : `${proto}://${host}`;

    let senderLabel = '';
    const cleanOrg = orgName ? String(orgName).trim() : '';
    const cleanUser = senderName ? String(senderName).trim() : '';

    if (cleanOrg && cleanUser) {
      senderLabel = `${cleanOrg} (${cleanUser})`;
    } else if (cleanOrg) {
      senderLabel = cleanOrg;
    } else if (cleanUser) {
      senderLabel = `${cleanUser} / Abrevia`;
    } else {
      senderLabel = 'Abrevia';
    }

    const lang = (targetLang || 'es').toLowerCase();
    if (lang === 'en') {
      smsContentToSend = `You have a message from ${senderLabel}.\nOpen your message here: ${messageLink}\n\nReply STOP to unsubscribe.`;
    } else {
      smsContentToSend = `Tiene un mensaje de ${senderLabel}.\nAbra su mensaje aquí: ${messageLink}\n\nResponda ALTO para no recibir más mensajes.`;
    }
  } else {
    smsContentToSend = mediaUrl ? `${body}\n\n📎 Adjunto: ${mediaUrl}` : body;
  }

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
      const payloadText = isEncrypted ? encryptMessage(encryptionKey.trim(), smsContentToSend) : smsContentToSend;

      const requestPayload = {
        content: payloadText,
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

      const response = await fetch(textbeeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': textbeeApiKey
        },
        body: JSON.stringify({
          recipients: [to],
          message: smsContentToSend
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
