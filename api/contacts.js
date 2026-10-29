import { getAllContacts, saveContact, saveContactsBatch, deleteContact, normalizePhone } from '../lib/contacts.js';
import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
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
      const { batch, phone, name, company, email, notes, opted_out, source, action } = req.body || {};

      // Handle subscribe updates (integrated from subscribe-updates.js)
      if (action === 'subscribe' || source || req.url?.includes('subscribe')) {
        if (!email && !phone) {
          return res.status(400).json({ error: 'Please provide at least an email or a phone number.' });
        }

        const subscriberRecord = {
          id: 'sub_' + Date.now(),
          email: email ? email.trim().toLowerCase() : null,
          phone: phone ? phone.trim() : null,
          name: name ? name.trim() : null,
          source: source || 'operator_ui',
          createdAt: new Date().toISOString()
        };

        try {
          if (supabase) {
            if (phone) {
              try {
                await saveContact({
                  phone: phone.trim(),
                  name: name || 'Operator Updates Subscriber',
                  notes: `Subscribed for updates via ${source || 'operator_ui'} at ${new Date().toISOString()}`
                });
              } catch (contactErr) {
                console.warn('Could not auto-save to contacts:', contactErr.message);
              }
            }

            let subscribers = [];
            try {
              const { data: fileData, error: downloadErr } = await supabase.storage
                .from('attachments')
                .download('system/subscribers.json');

              if (!downloadErr && fileData) {
                const text = await fileData.text();
                subscribers = text ? JSON.parse(text) : [];
              }
            } catch (dlErr) {
              subscribers = [];
            }

            const existingIdx = subscribers.findIndex(s => 
              (email && s.email === subscriberRecord.email) ||
              (phone && s.phone === subscriberRecord.phone)
            );

            if (existingIdx >= 0) {
              subscribers[existingIdx] = { ...subscribers[existingIdx], ...subscriberRecord, updatedAt: new Date().toISOString() };
            } else {
              subscribers.push(subscriberRecord);
            }

            const uploadBuffer = Buffer.from(JSON.stringify(subscribers, null, 2), 'utf-8');
            await supabase.storage
              .from('attachments')
              .upload('system/subscribers.json', uploadBuffer, {
                contentType: 'application/json',
                upsert: true
              });
          }

          return res.status(200).json({
            success: true,
            message: 'Subscription saved successfully.',
            subscriber: subscriberRecord
          });
        } catch (err) {
          console.error('Subscribe updates error:', err.message);
          return res.status(200).json({
            success: true,
            cached: true,
            message: 'Subscription recorded.'
          });
        }
      }

      if (batch && Array.isArray(batch)) {
        const saved = await saveContactsBatch(batch);
        return res.status(200).json({ success: true, count: saved.length, contacts: saved });
      }

      if (!phone) {
        return res.status(400).json({ error: 'Phone number is required' });
      }

      const contact = await saveContact({ phone, name, company, email, notes, opted_out });
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
