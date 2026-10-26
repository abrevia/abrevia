import { supabase } from './lib/supabase.js';

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

      return res.status(200).json({ ticket, messages });
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

      return res.status(200).json({ tickets });
    }
  }

  // POST /api/tickets -> create a new ticket
  if (req.method === 'POST') {
    const { customerPhone } = req.body || {};
    if (!customerPhone) {
      return res.status(400).json({ error: 'Missing customerPhone' });
    }

    const { data: ticket, error } = await supabase
      .from('tickets')
      .insert({
        customer_phone: customerPhone,
        status: 'active'
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json({ ticket });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
