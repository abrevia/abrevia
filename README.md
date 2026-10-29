# Abrevia 1 — Bilingual SMS Customer Support Relay (MVP)

Abrevia 1 is a "Zero-Download SaaS" bilingual (English/Spanish) customer support relay. Agents type in English from a web operations dashboard, text is instantly translated to Spanish via Google Gemini 1.5 Flash with Human-In-The-Loop (HITL) review, and delivered directly to the customer via SMS using httpSMS (physical Android gateway). When the customer replies in Spanish via SMS, it is translated back to English and displayed live in the agent's feed.

> **CRITICAL SCOPE:** Abrevia 1 is an administrative operations tool (tailored for Logistics, Property Management, Field Services, and Retail). It is strictly non-medical and non-HIPAA.
>
> 🏛️ **Compliance, Legal & Sector Documentation:**  
> * 🏛️ [**Who is this app for? / ¿Para quién es esta app? (Title VI & Sector Guide)**](WHO_IS_THIS_FOR.md)
> * 📋 [**Title VI Compliance Self-Assessment & Audit Dossier**](TITLE_VI_SELF_ASSESSMENT.md)
> * 📜 [**Terms of Service / Términos de Servicio**](TERMS_OF_SERVICE.md)
> * 🛡️ [**Privacy Policy / Aviso de Privacidad**](PRIVACY_POLICY.md)
> * ⚖️ [**Legal & Regulatory Disclaimers / Deslindes Legales**](DISCLAIMERS.md)

---

## 1. Tech Stack
* **Frontend:** HTML5, Tailwind CSS, Vanilla JS (Hosted on Vercel)
* **Backend:** Vercel Serverless Functions (Node.js ES Modules)
* **Database:** Supabase (PostgreSQL)
* **SMS Gateway:** httpSMS (Android device SIM card relay via HTTP API and webhooks)
* **AI Translation:** Google Gemini 1.5 Flash (`gemini-1.5-flash:generateContent`)

---

## 2. Directory Structure
```text
abrevia/
├── api/
│   ├── lib/
│   │   └── supabase.js     # Supabase client initializer
│   ├── translate.js        # Gemini 1.5 Flash translation proxy
│   ├── send-sms.js         # Outbound SMS via httpSMS + DB logging
│   ├── inbound-sms.js      # httpSMS Webhook (200 ACK + Gemini translate + Supabase message insert)
│   ├── purge.js            # Cascading deletion of ticket and messages
│   └── tickets.js          # List active tickets, get ticket messages, create new ticket
├── public/
│   ├── assets/
│   │   └── logo.png        # Official brand logo
│   ├── index.html          # Landing / Login page with administrative disclaimer
│   ├── dashboard.html      # Agent Workspace (Slate dark theme, queue sidebar, HITL review)
│   └── app.js              # Frontend logic (real-time polling, HITL review, send)
├── .env.example            # Environment variables template
├── .gitignore              # Ignores .env and node_modules
├── package.json            # Node.js dependencies
├── vercel.json             # Vercel deployment routing
└── README.md
```

---

## 3. Supabase Database Setup

Run the following SQL in your **Supabase SQL Editor**:

```sql
-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";

-- 1. Create tickets table
create table tickets (
  id uuid default uuid_generate_v4() primary key,
  customer_phone text not null,
  status text default 'active',
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Create messages table with cascading delete
create table messages (
  id uuid default uuid_generate_v4() primary key,
  ticket_id uuid references tickets(id) on delete cascade,
  sender text check (sender in ('agent', 'customer')),
  english_text text,
  spanish_text text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Optional: Create index for quick phone lookups
create index idx_tickets_phone on tickets (customer_phone, status);
create index idx_messages_ticket on messages (ticket_id, created_at);
```

---

## 4. Environment Variables (Vercel)

Configure the following in your Vercel Project Settings (`Settings -> Environment Variables`):

| Variable | Description | Example |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Google AI Studio Gemini API Key | `AIzaSy...` |
| `HTTPSMS_API_KEY` | httpSMS API Key | `sec_...` |
| `HTTPSMS_PHONE_NUMBER` | Your Android device SIM phone number | `+14155552671` |
| `SUPABASE_URL` | Supabase Project URL | `https://xyzcompany.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Secret Key | `eyJhbGciOi...` |

---

## 5. httpSMS Webhook Configuration

1. Install the **httpSMS app** on your dedicated Android phone with active SIM card.
2. In your httpSMS dashboard, set up a webhook pointing to your deployed Vercel URL:
   ```text
   https://your-abrevia-app.vercel.app/api/inbound-sms
   ```
3. Subscribe to the event: `message.phone.received`.

---

## 6. Running Locally

```bash
npm install
# Test using Vercel CLI:
vercel dev
```
Open `http://localhost:3000` in your browser.
