import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client is not configured' });
  }

  // GET /api/reply?t=ticketId -> Retrieve conversation summary for the recipient
  if (req.method === 'GET') {
    const ticketId = req.query.t || req.query.ticketId;
    if (!ticketId) {
      return res.status(400).json({ error: 'Missing conversation ticket identifier (?t=...)' });
    }

    try {
      const { data: ticket, error: ticketErr } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', ticketId)
        .single();

      if (ticketErr || !ticket) {
        // Return resilient placeholder if ticket was freshly generated client-side
        return res.status(200).json({
          ticket: {
            id: ticketId,
            sender_name: 'Despacho Operativo',
            status: 'active'
          },
          messages: []
        });
      }

      // Fetch the last few messages in this thread
      const { data: messages } = await supabase
        .from('messages')
        .select('id, sender, english_text, spanish_text, created_at')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false })
        .limit(10);

      return res.status(200).json({
        ticket: {
          id: ticket.id,
          sender_name: ticket.company || ticket.customer_name || 'Despacho Operativo',
          status: ticket.status || 'active'
        },
        messages: (messages || []).reverse()
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST /api/reply -> Recipient submits a reply in Spanish
  if (req.method === 'POST') {
    try {
      const { ticketId, message, phone } = req.body || {};
      if (!ticketId) {
        return res.status(400).json({ error: 'Missing ticketId' });
      }

      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'Message cannot be empty' });
      }

      const rawText = message.trim();
      let englishText = rawText;
      let spanishText = rawText;

      // 1. Automatic Bilingual Translation via Google Gemini
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        const models = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];
        for (const model of models) {
          try {
            const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
              },
              body: JSON.stringify({
                systemInstruction: {
                  parts: [{ text: 'You are Abrevia\'s Bilingual Dispatch Relay. Translate this message from Spanish into clear, natural English for the dispatch operator. Return ONLY valid JSON: {"english": "English translation here", "spanish": "Clean Spanish here"}. Raw JSON only, no markdown.' }]
                },
                contents: [{ parts: [{ text: rawText }] }],
                generationConfig: { responseMimeType: 'application/json' }
              }),
              signal: AbortSignal.timeout(3000)
            });

            if (geminiRes.ok) {
              const data = await geminiRes.json();
              const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.english) englishText = parsed.english.trim();
                if (parsed.spanish) spanishText = parsed.spanish.trim();
                break;
              }
            }
          } catch (transErr) {
            console.warn('Gemini translation notice in reply.js:', transErr.message);
          }
        }
      }

      // 2. Ensure ticket exists or is marked active
      try {
        const { data: existingTicket } = await supabase
          .from('tickets')
          .select('id, messages')
          .eq('id', ticketId)
          .single();

        if (existingTicket) {
          await supabase
            .from('tickets')
            .update({
              updated_at: new Date().toISOString(),
              snippet: spanishText.substring(0, 70)
            })
            .eq('id', ticketId);
        } else {
          // Auto-create ticket if not yet in DB
          await supabase
            .from('tickets')
            .insert({
              id: ticketId,
              customer_phone: phone || 'web_recipient',
              status: 'active',
              target_lang: 'es',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
        }
      } catch (tErr) {
        console.warn('Ticket upsert warning:', tErr.message);
      }

      // 3. Insert the inbound reply message into messages table
      const newMsgRecord = {
        ticket_id: ticketId,
        sender: 'customer',
        english_text: englishText,
        spanish_text: spanishText,
        created_at: new Date().toISOString()
      };

      const { data: insertedMsg, error: insertErr } = await supabase
        .from('messages')
        .insert(newMsgRecord)
        .select()
        .single();

      if (insertErr) {
        console.error('Database insert error:', insertErr);
        // Fallback response with the in-memory object
        return res.status(200).json({
          success: true,
          message: newMsgRecord
        });
      }

      return res.status(201).json({
        success: true,
        message: insertedMsg
      });

    } catch (err) {
      console.error('Error handling recipient reply:', err);
      return res.status(500).json({ error: 'Failed to process reply: ' + err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
