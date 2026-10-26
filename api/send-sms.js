import { supabase } from './lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { to, body, mediaUrl, ticketId, englishText } = req.body || {};

  if (!to || !body) {
    return res.status(400).json({ error: 'Missing recipient phone number (to) or message body' });
  }

  const httpsmsApiKey = process.env.HTTPSMS_API_KEY;
  const fromPhone = process.env.HTTPSMS_PHONE_NUMBER;

  if (!httpsmsApiKey || !fromPhone) {
    return res.status(500).json({ error: 'httpSMS environment variables are not configured' });
  }

  try {
    const response = await fetch('https://api.httpsms.com/v1/messages/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': httpsmsApiKey
      },
      body: JSON.stringify({
        content: body,
        from: fromPhone, // Android device number
        to: to,
        attachments: mediaUrl ? [mediaUrl] : []
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('httpSMS Error response:', errText);
      throw new Error(`httpSMS returned status ${response.status}: ${errText}`);
    }

    // Save outbound message to Supabase if ticketId is present
    let savedMessage = null;
    if (supabase && ticketId) {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          ticket_id: ticketId,
          sender: 'agent',
          english_text: englishText || body,
          spanish_text: body
        })
        .select()
        .single();

      if (error) {
        console.error('Supabase message insert error:', error);
      } else {
        savedMessage = data;
      }
    }

    res.status(200).json({ success: true, message: savedMessage });
  } catch (error) {
    console.error('Failed to send SMS:', error);
    res.status(500).json({ error: 'Failed to send SMS: ' + error.message });
  }
}
