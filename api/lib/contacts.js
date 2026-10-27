import { supabase } from './supabase.js';

const STORAGE_BUCKET = 'attachments';
const STORAGE_FILE = 'system/contacts.json';

// In-memory cache to avoid redundant storage downloads
let contactsCache = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 10000; // 10 seconds

export function normalizePhone(phone) {
  if (!phone) return '';
  // Keep leading +, remove all other non-digit characters
  let clean = phone.trim().replace(/[^\d+]/g, '');
  if (!clean.startsWith('+')) {
    // If no leading +, prefix with + if it looks like a full number
    clean = '+' + clean;
  }
  return clean;
}

export async function getAllContacts() {
  const now = Date.now();
  if (contactsCache && (now - lastFetchTime < CACHE_TTL_MS)) {
    return contactsCache;
  }

  if (!supabase) {
    return contactsCache || {};
  }

  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(STORAGE_FILE);

    if (error) {
      // File might not exist yet
      if (!contactsCache) contactsCache = {};
      return contactsCache;
    }

    const text = await data.text();
    contactsCache = text ? JSON.parse(text) : {};
    lastFetchTime = now;
    return contactsCache;
  } catch (err) {
    console.warn('Error fetching contacts storage:', err.message);
    return contactsCache || {};
  }
}

export async function saveContact({ phone, name, company, email, notes }) {
  if (!phone) throw new Error('Phone number is required');
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error('Invalid phone number');

  const contacts = await getAllContacts();
  const existing = contacts[normalized] || {
    phone: normalized,
    createdAt: new Date().toISOString()
  };

  const updatedContact = {
    ...existing,
    phone: normalized,
    name: name !== undefined ? name.trim() : (existing.name || ''),
    company: company !== undefined ? company.trim() : (existing.company || ''),
    email: email !== undefined ? email.trim() : (existing.email || ''),
    notes: notes !== undefined ? notes.trim() : (existing.notes || ''),
    updatedAt: new Date().toISOString()
  };

  contacts[normalized] = updatedContact;
  contactsCache = contacts;
  lastFetchTime = Date.now();

  if (supabase) {
    const buffer = Buffer.from(JSON.stringify(contacts, null, 2), 'utf8');
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(STORAGE_FILE, buffer, {
        contentType: 'application/json',
        upsert: true
      });

    if (error) {
      console.error('Error saving contacts to storage:', error.message);
    }
  }

  return updatedContact;
}

export async function deleteContact(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return false;

  const contacts = await getAllContacts();
  if (!contacts[normalized]) return false;

  delete contacts[normalized];
  contactsCache = contacts;
  lastFetchTime = Date.now();

  if (supabase) {
    const buffer = Buffer.from(JSON.stringify(contacts, null, 2), 'utf8');
    await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(STORAGE_FILE, buffer, {
        contentType: 'application/json',
        upsert: true
      });
  }

  return true;
}
