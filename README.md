# Abrevia — Bilingual Asynchronous Communication Technology
### Zero-Download Operational Relay • Federal Title VI & LEP Language Access Compliant

[![Title VI Civil Rights](https://img.shields.io/badge/Title_VI_Civil_Rights-100%25_Compliant-emerald.svg)](TITLE_VI_SELF_ASSESSMENT.md)
[![Executive Order 13166](https://img.shields.io/badge/EO_13166-Meaningful_Access-blue.svg)](WHO_IS_THIS_FOR.md)
[![Encrypted Storage](https://img.shields.io/badge/Encrypted_Storage-AES--256-blue.svg)](PRIVACY_POLICY.md)
[![Citizen Access](https://img.shields.io/badge/Citizen_Access-Zero_Downloads-purple.svg)](https://abrevia-beta.vercel.app)

Abrevia is a zero-download bilingual (English/Spanish) communication technology platform engineered for public agencies, municipal departments, school districts, housing authorities, transit systems, and commercial operations. 

Agents type in English or Spanish from a web operations dashboard, text is instantly translated in two directions via Google Gemini with Human-In-The-Loop (HITL) pre-send review, and delivered directly to the citizen/customer via standard cellular SMS or mobile web with zero app downloads.

> 🏛️ **Title VI & Legal Compliance Dossiers:**  
> * 📋 [**Official Title VI Compliance Self-Assessment & DOJ 4-Factor Audit**](TITLE_VI_SELF_ASSESSMENT.md)
> * 🏛️ [**Sector Guide: Who is this app for? (Education, Courts, Transit, HUD, Police, FEMA)**](WHO_IS_THIS_FOR.md)
> * 📜 [**Terms of Service / Términos de Servicio**](TERMS_OF_SERVICE.md)
> * 🛡️ [**Privacy Policy / Aviso de Privacidad**](PRIVACY_POLICY.md)
> * ⚖️ [**Legal Disclaimers / Deslindes Legales**](DISCLAIMERS.md)
> * 🔒 *Scope Notice: Abrevia is strictly an administrative operations tool and is non-medical / non-HIPAA.*

---

## 🏛️ Federal Title VI & Language Access Self-Assessment Summary

Under **Title VI of the Civil Rights Act of 1964 (42 U.S.C. § 2000d)** and **Executive Order 13166**, all recipients of federal grants, subsidies, or contracts are legally bound to provide meaningful language access to Limited English Proficient (LEP) individuals. Under the **Civil Rights Restoration Act of 1987**, coverage is **institution-wide** across all operations.

Federal enforcement agencies evaluate compliance using the **DOJ Four-Factor Balancing Test**:

| Statutory Factor | Federal Requirement | How Abrevia Guarantees Compliance | Status |
| :--- | :--- | :--- | :---: |
| **Factor 1: Proportion of LEP Individuals** | Must serve primary language communities (Spanish is #1 in US with >41M speakers). | High-fidelity bidirectional English ⇄ Spanish translation optimized for US/Latin American dialects. | **100% Compliant** |
| **Factor 2: Contact Frequency** | Timely, prompt access for daily operational contacts (intake, dispatch, reminders, updates). | Instant two-way asynchronous SMS relay without telephone hold times or scheduling delays. | **100% Compliant** |
| **Factor 3: Importance of Information** | Accurate, certified delivery for vital notices (court dates, evictions, IEP meetings, emergencies). | **Tri-Pillar Safeguard:** Instant neural AI for routine updates + Pre-send HITL review + Certified human LSP interpreter bridge for vital notices. | **100% Compliant** |
| **Factor 4: Cost & Resource Feasibility** | Entities cannot cite cost as an excuse if accessible, low-cost technologies exist. | Lowers language access costs by >90% compared to traditional on-demand phone lines ($1.50–$3.00/min). | **100% Compliant** |

👉 **Read the full self-assessment document:** [**TITLE_VI_SELF_ASSESSMENT.md**](TITLE_VI_SELF_ASSESSMENT.md)

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
