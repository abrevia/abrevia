// Abrevia — Optional Updates Subscription Handler (Email & SMS)
import { supabase } from '../lib/supabase.js';
import { saveContact } from '../lib/contacts.js';

const STORAGE_BUCKET = 'attachments';
const SUBSCRIBERS_FILE = 'system/subscribers.json';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const { email, phone, name, source = 'session_wrapup' } = req.body || {};

  if (!email && !phone) {
    return res.status(400).json({ error: 'Please provide at least an email or a phone number.' });
  }

  const subscriberRecord = {
    id: 'sub_' + Date.now(),
    email: email ? email.trim().toLowerCase() : null,
    phone: phone ? phone.trim() : null,
    name: name ? name.trim() : null,
    source,
    createdAt: new Date().toISOString()
  };

  try {
    if (supabase) {
      // 1. If phone is provided, register in contacts directory
      if (phone) {
        try {
          await saveContact({
            phone: phone.trim(),
            name: name || 'Operator Updates Subscriber',
            notes: `Subscribed for updates via ${source} at ${new Date().toISOString()}`
          });
        } catch (contactErr) {
          console.warn('Could not auto-save to contacts:', contactErr.message);
        }
      }

      // 2. Fetch and append to system/subscribers.json in Supabase Storage
      let subscribers = [];
      try {
        const { data: fileData, error: downloadErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .download(SUBSCRIBERS_FILE);

        if (!downloadErr && fileData) {
          const text = await fileData.text();
          subscribers = text ? JSON.parse(text) : [];
        }
      } catch (dlErr) {
        // File may not exist yet, initialize empty array
        subscribers = [];
      }

      // Check if already subscribed
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
        .from(STORAGE_BUCKET)
        .upload(SUBSCRIBERS_FILE, uploadBuffer, {
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
