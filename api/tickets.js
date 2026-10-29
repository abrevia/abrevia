import { supabase } from '../lib/supabase.js';
import { getAllContacts, saveContact, normalizePhone } from '../lib/contacts.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client is not configured' });
  }

  // DELETE /api/tickets (or /api/purge) -> Delete/Purge ticket and cascade wipe messages
  if (req.method === 'DELETE') {
    const ticketId = req.body?.ticketId || req.query?.ticketId || req.query?.id;
    if (!ticketId) {
      return res.status(400).json({ error: 'Missing ticketId' });
    }

    try {
      const { error } = await supabase
        .from('tickets')
        .delete()
        .eq('id', ticketId);

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ success: true, message: 'Ticket and associated messages purged.' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // GET /api/tickets -> list active tickets OR get messages for specific ticket
  if (req.method === 'GET') {
    const { id } = req.query;

    if (id) {
      // Get messages for ticket
      const { data: messages, error: msgErr } = await supabase
        .from('messages')
        .select('*')
        .eq('ticket_id', id)
        .order('created_at', { ascending: true });

      if (msgErr) {
        return res.status(500).json({ error: msgErr.message });
      }

      // Also get ticket details
      const { data: ticket, error: ticketErr } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', id)
        .single();

      if (ticketErr) {
        return res.status(500).json({ error: ticketErr.message });
      }

      const contacts = await getAllContacts();
      const normPhone = normalizePhone(ticket.customer_phone);
      const contact = contacts[normPhone] || { phone: ticket.customer_phone, name: '' };

      return res.status(200).json({ 
        ticket: { ...ticket, contact }, 
        messages 
      });
    } else {
      // List all active tickets
      const { data: tickets, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      const contacts = await getAllContacts();
      const enrichedTickets = (tickets || []).map(t => {
        const normPhone = normalizePhone(t.customer_phone);
        const contact = contacts[normPhone] || { phone: t.customer_phone, name: '' };
        return {
          ...t,
          contact
        };
      });

      return res.status(200).json({ tickets: enrichedTickets });
    }
  }

  // POST /api/tickets -> create new ticket OR handle reply / optout / system message
  if (req.method === 'POST') {
    const { ticketId, message, senderName, sender, action, customerPhone, customerName, company, email, notes } = req.body || {};

    // Sub-case: Message reply / audit insertion (formerly api/reply.js)
    if (ticketId) {
      try {
        const { data: ticket, error: ticketErr } = await supabase
          .from('tickets')
          .select('*')
          .eq('id', ticketId)
          .single();

        if (ticketErr || !ticket) {
          return res.status(404).json({ error: 'Conversation ticket not found' });
        }

        const customerPhoneNum = ticket.customer_phone;

        if (action === 'optout') {
          try {
            await saveContact({
              phone: customerPhoneNum,
              opted_out: true
            });
          } catch (optErr) {
            console.warn('Optout save contact note:', optErr.message);
          }

          await supabase.from('messages').insert({
            ticket_id: ticketId,
            sender: 'system',
            english_text: message || '🚫 Recipient has opted out of messaging (via web link).',
            spanish_text: message || '🚫 El destinatario ha cancelado la recepción de mensajes (vía enlace web).'
          });

          return res.status(200).json({ success: true, optedOut: true, message: 'Opt-out registered successfully' });
        }

        if (!message || !message.trim()) {
          return res.status(400).json({ error: 'Message body cannot be empty' });
        }

        const text = message.trim();
        const upper = text.toUpperCase();
        const isOptOut = /^(STOP|ALTO|CANCEL|BAJA|UNSUBSCRIBE|QUIT|END)$/i.test(upper);
        const isOptIn = /^(START|UNSTOP|REANUDAR|INICIAR)$/i.test(upper);

        if (isOptOut || isOptIn) {
          try {
            await saveContact({
              phone: customerPhoneNum,
              opted_out: isOptOut
            });
          } catch (cErr) {
            console.warn('Error updating contact opt-out status:', cErr.message);
          }
        }

        let englishText = text;
        let spanishText = text;
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
                    parts: [{ text: 'You are Abrevia\'s Bilingual Self-Correcting Message Relay. Always auto-correct all misspellings, typos, shorthand/abbreviations, phonetic errors, missing accents, and grammatical mistakes in the inbound text. Detect whether the message is in Spanish or English. Return a JSON object with: "detected" ("es" or "en"), "english" (the clean, grammatically correct and polished message in English), "spanish" (the clean, grammatically correct and polished message in Spanish). Return ONLY raw valid JSON.' }]
                  },
                  contents: [{ parts: [{ text: text }] }],
                  generationConfig: { responseMimeType: 'application/json' }
                }),
                signal: AbortSignal.timeout(3000)
              });

              const geminiData = await geminiRes.json();
              const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
              if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.english) englishText = parsed.english.trim();
                if (parsed.spanish) spanishText = parsed.spanish.trim();
                break;
              }
            } catch (transErr) {
              console.error(`Gemini translation error with ${model}:`, transErr);
            }
          }
        }

        const effectiveSender = sender || senderName || 'customer';

        const { data: insertedMsg, error: insertErr } = await supabase
          .from('messages')
          .insert({
            ticket_id: ticketId,
            sender: effectiveSender,
            english_text: englishText,
            spanish_text: spanishText
          })
          .select()
          .single();

        if (insertErr) {
          return res.status(500).json({ error: insertErr.message });
        }

        return res.status(200).json({ success: true, message: insertedMsg, optedOut: isOptOut });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // Default POST case: Create a new conversation ticket
    if (!customerPhone) {
      return res.status(400).json({ error: 'Missing customerPhone' });
    }

    const normPhone = normalizePhone(customerPhone);

    // 1. Auto-save contact with optional name/info
    let contact = null;
    try {
      contact = await saveContact({
        phone: normPhone,
        name: customerName,
        company,
        email,
        notes
      });
    } catch (cErr) {
      console.warn('Error auto-saving contact:', cErr.message);
    }

    // 2. Insert ticket into Supabase
    const { data: ticket, error } = await supabase
      .from('tickets')
      .insert({
        customer_phone: normPhone,
        status: 'active'
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json({ 
      ticket: { ...ticket, contact: contact || { phone: normPhone, name: customerName || '' } } 
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
