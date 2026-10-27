# Abrevia 2 — HIPAA & Clinical Compliance Upgrade Blueprint
**Document Status:** Architectural Roadmap (Patiently Deferred to Abrevia 2)  
**Current Production Version:** Abrevia 1 (Administrative Operations Tool — Non-Medical)  
**Target Standard:** HIPAA Security Rule (§164.308, §164.312), ACA Section 1557 (Language Access), and Zero Data Retention (ZDR)

---

## Executive Summary
Abrevia 1 was intentionally designed and deployed as a lean, high-velocity administrative SMS relay. However, its core software architecture was constructed with strict modularity and boundary separation to ensure that the transition to **Abrevia 2 (HIPAA & Healthcare Compliance)** is a seamless, plug-and-play upgrade rather than a rewrite.

This document details the architectural foundation established in Abrevia 1 and the exact extension points that will be activated when upgrading to Abrevia 2.

---

## 1. Architectural Foundations Established in Abrevia 1

| Component | Abrevia 1 Status | Abrevia 2 Upgrade Readiness |
| :--- | :--- | :--- |
| **Human-In-The-Loop (HITL)** | Built into Agent Composer with live review | Meets ACA Section 1557 requirements for human oversight in language assistance services |
| **Zero Data Retention (ZDR)** | Permanent cascade purge via `api/purge.js` | Supports HIPAA §164.310 media sanitization and PHI auto-expiration protocols |
| **Data Boundary Isolation** | Serverless functions (`/api/*`) on HTTPS TLS 1.3 | Guarantees encrypted transit (HIPAA §164.312(e)(1)) across all external calls |
| **Database Schema** | UUID v4 primary keys with `ON DELETE CASCADE` | Ready for Supabase Row-Level Security (RLS) policies and column-level encryption |
| **Bilingual Dispatch Relay** | Symmetric bidirectional English ↔ Spanish | Supports diverse clinical workflows (English Provider ↔ Spanish Patient) |

---

## 2. The 5 Modular Extension Points for Abrevia 2

### Extension Point 1: BAA-Compliant AI Translation Engine
* **Current (Abrevia 1):** Google Gemini Flash endpoints (`generativelanguage.googleapis.com`).
* **Abrevia 2 Upgrade:** Plug in **Google Cloud Vertex AI** with enterprise Business Associate Agreement (BAA) signed via Google Cloud Organization (`serviciosadg's Org`).
* **Implementation:** The request and response schemas in `api/translate.js` remain identical; only the authentication header and endpoint domain switch from public developer keys to GCP OAuth 2.0 service credentials under BAA terms.

### Extension Point 2: BAA-Compliant SMS/MMS Gateway
* **Current (Abrevia 1):** httpSMS gateway via dedicated cellular relay.
* **Abrevia 2 Upgrade:** Introduce an SMS Provider Interface (`api/lib/sms-provider.js`):
  ```javascript
  // Seamless provider switch via environment configuration:
  // SMS_PROVIDER='httpsms' (Administrative) | 'twilio_healthcare' (HIPAA BAA)
  export async function dispatchSms({ to, body, mediaUrl }) {
    if (process.env.SMS_PROVIDER === 'twilio_healthcare') {
      return sendViaTwilioBaa({ to, body, mediaUrl });
    }
    return sendViaHttpSms({ to, body, mediaUrl });
  }
  ```

### Extension Point 3: Immutable Audit Trails (HIPAA Security Rule §164.312(b))
* **Current (Abrevia 1):** Server console logging.
* **Abrevia 2 Upgrade:** Activate an append-only `audit_logs` table in Supabase tracking:
  - `actor_id` (Agent UUID)
  - `action_type` (`THREAD_VIEWED`, `TRANSLATION_REQUESTED`, `SMS_DISPATCHED`, `THREAD_PURGED`)
  - `ticket_id`
  - `timestamp_utc`
  - `ip_hash`

### Extension Point 4: PHI Sanitization Pipeline (Pre-Translation Scrubbing)
* **Current (Abrevia 1):** Preserved in `archive_legacy/v2/lib/sanitize.js`.
* **Abrevia 2 Upgrade:** Integrate Regex & NER (Named Entity Recognition) scrubber before text enters the translation layer to tokenize:
  - Medical Record Numbers (MRNs)
  - Social Security Numbers (SSNs)
  - Date of Birth (DOB)
  - Specific patient identifiers

### Extension Point 5: Automated Session Expiration & Role-Based Access Control (RBAC)
* **Current (Abrevia 1):** Administrative single-session passkey.
* **Abrevia 2 Upgrade:** Enable Supabase Auth with PKCE and mandatory 15-minute inactivity timeouts (HIPAA §164.312(a)(2)(iii)) and multi-factor authentication (MFA).

---

## 3. Recommended Development Staging
1. **Stage 1 (Current):** Stabilize and expand Abrevia 1 for non-medical operations (logistics, property management, retail, field services).
2. **Stage 2 (Design Alignment):** Review organizational BAA signing requirements with cloud providers (Google Cloud GCP & SMS aggregators).
3. **Stage 3 (Abrevia 2 Activation):** Fork/promote database schemas with RLS, audit logs, and activate the BAA translation bridge.

---
*Created by DeepMind Agentic Coding Architecture & Engineering.*
