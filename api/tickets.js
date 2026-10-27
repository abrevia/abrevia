import { supabase } from './lib/supabase.js';
import { getAllContacts, saveContact, normalizePhone } from './lib/contacts.js';

export default async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client is not configured' });
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

  // POST /api/tickets -> create a new ticket & auto-save contact
  if (req.method === 'POST') {
    const { customerPhone, customerName, company, email, notes } = req.body || {};
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
