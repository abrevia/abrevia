# Abrevia 1 — httpSMS End-to-End Encryption (E2EE) Setup Guide

## 1. How httpSMS Encryption Works
Abrevia now implements **AES-256-CFB End-to-End Encryption (E2EE)** matching the exact native cryptographic specification of the httpSMS Android gateway.

When enabled:
1. **Outbound SMS:** When an agent confirms a translation, Abrevia encrypts the Spanish (or English) text using **AES-256** with a randomly generated 16-byte Initialization Vector (IV) and a SHA-256 key hash before dispatching to `https://api.httpsms.com/v1/messages/send`.
2. **Zero-Knowledge Cloud:** The httpSMS cloud servers only receive and queue **Base64 ciphertext** (`encrypted: true`). The httpSMS servers **cannot read your message content**.
3. **Local Android Decryption:** The physical Android phone receives the ciphertext, decrypts it locally using its stored passphrase, and dispatches the native cellular SMS to the recipient.
4. **Inbound SMS Decryption:** When the recipient replies via SMS, the Android phone encrypts the incoming message before forwarding it to Abrevia's webhook (`/api/inbound-sms`), where Abrevia decrypts it using the matching key.

---

## 2. Step-by-Step Android Configuration

1. **Open the httpSMS App** on your Android gateway phone (`+526601750245`).
2. Tap the **Settings** icon (gear in the top right).
3. Scroll down to **"End-to-End Encryption"** (or **"Encryption"**).
4. Toggle **Enable Encryption** to ON.
5. Enter a strong **Encryption Password / Passphrase** (e.g. `AbreviaSecOps2026!`).
6. Tap **Save**.

---

## 3. Step-by-Step Abrevia Configuration

Add the exact same passphrase to your environment variables:

### Locally (`.env`):
```env
HTTPSMS_ENCRYPTION_KEY=AbreviaSecOps2026!
```

### In Production (Vercel):
1. Go to your [Vercel Dashboard](https://vercel.com/) &rarr; Project **`abrevia`** &rarr; **Settings** &rarr; **Environment Variables**.
2. Add a new variable:
   - **Key:** `HTTPSMS_ENCRYPTION_KEY`
   - **Value:** `AbreviaSecOps2026!` *(exact same passphrase entered in the Android app)*
3. Save and redeploy (or trigger deployment on next git push).

---

## 4. Verification & Testing

- **When `HTTPSMS_ENCRYPTION_KEY` is set:**
  All outbound payloads sent to httpSMS have `"encrypted": true` and `content` set to AES-256 Base64 ciphertext.
- **When `HTTPSMS_ENCRYPTION_KEY` is empty:**
  Abrevia gracefully defaults to standard unencrypted SMS transmission, ensuring zero downtime or failed deliveries if encryption is disabled.
