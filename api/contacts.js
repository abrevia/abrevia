import { getAllContacts, saveContact, saveContactsBatch, deleteContact, normalizePhone } from '../lib/contacts.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { phone } = req.query || {};
      const contacts = await getAllContacts();

      if (phone) {
        const normalized = normalizePhone(phone);
        const contact = contacts[normalized] || null;
        return res.status(200).json({ contact });
      }

      return res.status(200).json({ 
        contacts: contacts,
        list: Object.values(contacts).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      });
    } catch (err) {
      console.error('Error fetching contacts:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { batch, phone, name, company, email, notes } = req.body || {};

      if (batch && Array.isArray(batch)) {
        const saved = await saveContactsBatch(batch);
        return res.status(200).json({ success: true, count: saved.length, contacts: saved });
      }

      if (!phone) {
        return res.status(400).json({ error: 'Phone number is required' });
      }

      const contact = await saveContact({ phone, name, company, email, notes });
      return res.status(200).json({ success: true, contact });
    } catch (err) {
      console.error('Error saving contact:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { phone } = req.query || req.body || {};
      if (!phone) {
        return res.status(400).json({ error: 'Phone number is required' });
      }

      const success = await deleteContact(phone);
      return res.status(200).json({ success });
    } catch (err) {
      console.error('Error deleting contact:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
