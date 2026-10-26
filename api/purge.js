import { supabase } from './lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const { ticketId } = req.body || {};
  if (!ticketId) {
    return res.status(400).json({ error: 'Missing ticketId' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client is not configured' });
  }

  try {
    // Delete from tickets table. Messages are automatically wiped due to ON DELETE CASCADE.
    const { error } = await supabase
      .from('tickets')
      .delete()
      .eq('id', ticketId);

    if (error) {
      console.error('Supabase purge error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({ success: true, message: 'Data purged.' });
  } catch (err) {
    console.error('Purge exception:', err);
    res.status(500).json({ error: err.message });
  }
}
