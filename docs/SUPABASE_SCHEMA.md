# Abrevia Database & Contacts Architecture

## 1. Overview
Abrevia auto-saves recipient phone numbers as contacts whenever:
1. An operator starts a new recipient thread (`POST /api/tickets`).
2. An inbound SMS arrives from a customer or driver (`POST /api/inbound-sms`).
3. An operator saves or updates details in the Contact Directory or Conversation Header (`POST /api/contacts`).

Contact metadata (Name, Company/Role, Email, and Internal Notes) is stored in persistent Supabase Storage (`system/contacts.json`) and synchronized with the frontend client cache.

---

## 2. Optional Supabase Relational Schema (PostgreSQL)
If you wish to manage contacts directly inside a dedicated relational PostgreSQL table in your Supabase SQL Editor:

```sql
-- Create contacts table
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT '',
    company TEXT DEFAULT '',
    email TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index on phone for sub-second lookups
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts (phone);

-- Row Level Security (RLS)
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access" ON public.contacts
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
```
