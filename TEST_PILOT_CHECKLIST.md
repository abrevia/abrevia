# 📋 Abrevia End-to-End Test Pilot Checklist
### Comprehensive Operational Verification for Laptop (Desktop) & Mobile (Phone)

This checklist provides a structured, step-by-step testing protocol to validate every single feature of the Abrevia platform prior to full commercial deployment.

---

## 🎯 Pilot Testing Environments

| Environment | Device / Hardware | Recommended Browser | Primary Role |
| :--- | :--- | :--- | :--- |
| **Point A (Operator)** | Laptop / PC / Mac | Google Chrome, Edge, Safari | English Dispatcher & Agent Console |
| **Point A (Mobile Operator)** | Smartphone (iOS / Android) | Mobile Chrome / Safari (PWA) | On-the-go Dispatch & Field Supervisor |
| **Point B (Recipient)** | Any Smartphone (iOS / Android) | **Native WhatsApp App** & SMS Inbox | Spanish Constituent, Driver, or Customer |

---

## 1. Core Messaging & Translation Engine (Point A ➔ Point B)

- [ ] **1.1. English Draft Composition**
  - **Action:** Open an active conversation, type a message in English in `#agent-input` (e.g. *"Your package is arriving tomorrow at 2:00 PM. Please have someone available to sign."*).
  - **Laptop Verification:** Text types smoothly; Enter key or `Send ↵` button triggers dispatch.
  - **Phone Verification:** Virtual keyboard opens cleanly without pushing the input bar off-screen.
- [ ] **1.2. Real-Time Neural Translation & Grammar Self-Correction**
  - **Action:** Intentionally include misspellings/grammar errors in English (e.g. *"yr pakage is ariving tomorow at 2pm"*).
  - **Verification:** Abrevia's self-correcting engine cleans the draft and generates natural, grammatically correct Spanish (*"Su paquete llegará mañana a las 2:00 p.m. Por favor asegúrese de que alguien esté disponible para firmar."*).
- [ ] **1.3. Outbound Dispatch via WhatsApp with SMS Fallback**
  - **Action:** Click `Send ↵`.
  - **Verification:** 
    - Translation progress bar advances smoothly (0% &rarr; 100%).
    - Message routes to `/api/send-whatsapp`.
    - If Meta WhatsApp credentials are configured, Point B receives a native WhatsApp message in Spanish.
    - If WhatsApp credentials are not yet entered, it seamlessly falls back to SMS via the cellular gateway without failing.
- [ ] **1.4. In-App Transcript Feed**
  - **Verification:** Outbound bubble appears on the right in the chat feed with:
    - Delivered Spanish text (blue header).
    - Original English draft (sub-line).
    - Timestamp and `✓✓ Delivered` receipt mark.

---

## 2. Inbound Reception & Real-Time Alerts (Point B ➔ Point A)

- [ ] **2.1. Point B Spanish Native Reply**
  - **Action:** From Point B's phone (in WhatsApp or SMS), reply in Spanish: *"Muchas gracias, estaré en casa esperándolo."*
  - **Verification:** Point A's dashboard receives the webhook within seconds.
- [ ] **2.2. Inbound Translation (Spanish ➔ English)**
  - **Verification:** Message appears on the left side of Point A's chat feed translated cleanly into English: *"Thank you very much, I will be home waiting for it."* with the original Spanish preserved side-by-side for audit fidelity.
- [ ] **2.3. Multi-Channel Alert Suite**
  - **Discreet Audio Chime:** Point A's laptop/phone plays the custom dual-tone harmonic chime (D5 &rarr; A5 fifth).
  - **Mobile Haptic Vibration:** Phone vibrates discreetly (`[40ms, 50ms, 40ms]`).
  - **Desktop / PWA Notification:** If the tab is in the background or screen is locked, OS push notification fires (`"🔔 Mario: Thank you very much..."`).
  - **Flashing Tab Header:** Browser tab title flashes (`🔔 (1) New Message | Abrevia`).

---

## 3. Human-In-The-Loop (HITL) Proofread Mode

- [ ] **3.1. Enable HITL Mode**
  - **Action:** Click `[ 🛡️ Proofread (HITL) OFF ]` on the bottom control bar.
  - **Verification:** Badge flips to `[ 🛡️ Proofread (HITL) ON ]` with an active highlight.
- [ ] **3.2. Pre-Send Review Interception**
  - **Action:** Type an English message and hit `Send ↵`.
  - **Verification:** The message is **not** immediately dispatched. Instead, the `#hitlContainer` editable review box pops up displaying the translated Spanish text.
- [ ] **3.3. Manual Operator Polish & Approval**
  - **Action:** Edit a word or phrase in the Spanish review box and click `Confirm & Send`.
  - **Verification:** The edited version is transmitted to Point B; the audit log reflects human verification.
- [ ] **3.4. Cancel HITL Buffer**
  - **Action:** Click `Cancel` in the review buffer.
  - **Verification:** Dispatch is aborted; draft remains safe in the composer.

---

## 4. On-Demand Certified LSP Interpreter Escalation

- [ ] **4.1. Request Live Interpreter**
  - **Action:** Click `[ 🎧 Request Live Interpreter Now ]`.
  - **Verification:** Modal opens offering **Message Review** vs. **3-Way Phone Bridge (OPI)**.
- [ ] **4.2. Confirmation & Audit Stamp**
  - **Action:** Select service type and click `Request Interpreter Now`.
  - **Verification:** 
    - Button displays glowing `REQ` badge.
    - System audit notice is injected into the conversation thread (e.g. *"🎧 Live Certified Interpreter requested via LSP network..."*).
- [ ] **4.3. Cancellation**
  - **Action:** Re-open modal and click `Cancel Interpreter Request`.
  - **Verification:** Status resets cleanly to inactive.

---

## 5. Contact & Conversation Management

- [ ] **5.1. New Conversation Creation**
  - **Action:** Click `+ New Conversation`. Enter Name (e.g. *"Carlos Logistics"*), Phone Number (with country code `+1` or `+52`), and optional initial message.
  - **Verification:** New ticket appears instantly at the top of the sidebar queue and opens the thread.
- [ ] **5.2. Auto-Saved Contact Info**
  - **Action:** Click `[ 👤 Contact Info ]` in the conversation header. Update Company name (*"Acme Transport"*), email, or notes.
  - **Verification:** Information saves automatically to Supabase and updates the ticket subtitle.
- [ ] **5.3. Mobile Responsive Navigation (Split-View &larr;&rarr; Chat)**
  - **Action on Phone:** Tap a conversation in the sidebar &rarr; chat opens full-screen. Tap `← Chats` button &rarr; returns to conversation list.
  - **Verification:** Smooth 60fps view transitions with zero layout glitches.
- [ ] **5.4. Conversation Purge**
  - **Action:** Click `[ 🗑️ Purge ]` in the chat header &rarr; confirm prompt.
  - **Verification:** Ticket and associated message history are securely erased from view and database.

---

## 6. Console Controls Hub (`⚙️ Menu` / `🟢 Active`)

- [ ] **6.1. Window Fit & Responsive 2-Column Layout**
  - **Action:** Click `[ ⚙️ Menu ]` on both Laptop (100% zoom) and Phone.
  - **Laptop Verification:** Renders as a balanced, wide 2-column modal (`max-w-2xl`) fitting comfortably within screen bounds.
  - **Phone Verification:** Adapts to a single column with smooth internal scrolling (`max-h-[88vh] overflow-y-auto`); Close button is always accessible.
- [ ] **6.2. Quick Utilities Verification**
  - **Billing:** `[ 💳 Billing ]` opens Stripe tier modal showing 100/500/1,500 message packs with live checkout buttons.
  - **Shortcut / PWA:** `[ 📲 Add Shortcut ]` triggers the native browser Add-to-Home-Screen prompt.
  - **Alerts Toggle:** `[ 🔔 Alerts ]` toggles between active and muted, persisting across page reloads in `localStorage`.
  - **Share:** `[ ↗ Share ]` opens native OS share sheet on phone; copies link to clipboard on laptop.
  - **Sign Out:** `[ 🚪 Sign Out ]` opens the session wrap-up modal with optional PIN lock and usage summary.
- [ ] **6.3. Live Test Tool**
  - **Action:** In the bottom test card, enter a mobile number (e.g. `+1...` or `+52...`) and press `Enter` or click `Send Test`.
  - **Verification:** Real-time feedback updates:
    - `⏳ Dispatching test SMS...`
    - `✅ SMS dispatched successfully!` (with provider metadata).
- [ ] **6.4. Security Dossier Modal**
  - **Action:** Click `Encrypted (AES-256 KMS) →`.
  - **Verification:** Cryptographic proof modal opens detailing AWS KMS envelope encryption, TLS 1.3, and SHA-256 integrity checks.

---

## 7. Productivity Macros & Tooling

- [ ] **7.1. Quick Response Templates (⚡ Templates)**
  - **Action:** Click `⚡ Templates` next to composer.
  - **Verification:** Category cards load (Logistics, Arrival, Confirmation, Service Delays). Clicking a template auto-populates the English composer ready for instant translation.
- [ ] **7.2. Scheduled Delivery (⏱️)**
  - **Action:** Click `⏱️` &rarr; select future time &rarr; confirm.
  - **Verification:** Message is queued for delayed release.
- [ ] **7.3. Attachment Uploads (📎)**
  - **Action:** Attach an image or PDF.
  - **Verification:** File thumbnail previews in composer; URL is securely encrypted and delivered to recipient.

---

## 8. Compliance & Legal Cross-Check

- [ ] **8.1. GitHub Documentation Links**
  - **Verification:** Clicking `Sectors`, `Terms`, `Privacy`, `Disclaimers`, or `info@mvhlsp.site` opens the respective Markdown documents with updated **HIPAA BAA & Title VI** disclosures.
- [ ] **8.2. Immutable Audit Trail**
  - **Verification:** Every ticket in Supabase preserves UTC timestamps, original English drafts, translated Spanish outputs, and carrier delivery IDs ready for civil rights or administrative audits.
