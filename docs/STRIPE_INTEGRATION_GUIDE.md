# Abrevia 1 — Stripe Monetization & Checkout Integration Guide

## 1. Overview
Abrevia 1 now features complete Stripe integration supporting three flexible monetization channels:
1. **Recurring Monthly Subscription ($49/mo)** — Abrevia Operations Pro (Unlimited bilingual SMS relay, Human-in-the-Loop review, MMS attachments, persistent latent channels).
2. **Pay-As-You-Go SMS Credit Packs ($20 one-time)** — 500 bilingual SMS relay messages with Google Gemini Flash AI translation.
3. **Stripe Payment Links Compatibility** — Option to drop in an existing hosted Stripe Payment Link directly.

---

## 2. API Endpoints Built & Deployed

| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `/api/checkout` | `POST` | Generates a Stripe Checkout Session for subscriptions ($49/mo) or credit packs ($20), or redirects to a Stripe Payment Link. |
| `/api/customer-portal` | `POST` | Generates a Stripe Customer Portal link allowing clients to manage payment cards, view invoices, download receipts, or cancel subscriptions. |
| `/api/stripe-webhook` | `POST` | Listens for real-time Stripe webhooks (`checkout.session.completed`, `customer.subscription.updated`, `invoice.payment_succeeded`). |

---

## 3. Environment Variables Configuration

Add the following keys to your `.env` file locally and in your **Vercel Project Settings > Environment Variables**:

```env
# 1. Stripe API Keys (Test Mode)
# Found at https://dashboard.stripe.com/test/apikeys
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# 2. Stripe Webhook Secret (Optional for basic checkout, required for webhook validation)
# Found under Stripe Dashboard > Developers > Webhooks
STRIPE_WEBHOOK_SECRET=whsec_...

# 3. Optional Custom Overrides
# If you created specific Products/Prices in your Stripe Dashboard, provide their IDs here:
STRIPE_MONTHLY_PRICE_ID=price_...
STRIPE_CREDITS_PRICE_ID=price_...

# If you prefer using a hosted Stripe Payment Link directly:
STRIPE_PAYMENT_LINK_PRO=https://buy.stripe.com/...
```

> [!NOTE]
> If `STRIPE_MONTHLY_PRICE_ID` and `STRIPE_CREDITS_PRICE_ID` are omitted, Abrevia **automatically generates** the line items on the fly ($49.00 USD/month recurring and $20.00 USD one-time), requiring **zero catalog setup** in Stripe!

---

## 4. UI Touchpoints

1. **Landing Page (`public/index.html`)**:
   - Header button: `💳 Pricing & Plans` (`Planes y Tarifas` in Spanish).
   - Interactive Pricing Modal featuring:
     - 500 SMS Credit Pack ($20 one-time).
     - Operations Pro ($49/month).
     - Abrevia 2 Clinical Preview (links to HIPAA roadmap modal).
   - Fully bilingual with live currency and feature descriptions.

2. **Operations Console (`public/dashboard.html`)**:
   - Navigation header button: `💳 Billing` (`Facturación` in Spanish). Styled with the exact same print as `Sign Out` (`text-xs text-slate-400 font-normal`).
   - Billing Modal allowing instant credit reloads, monthly plan activation, and Stripe Customer Portal access.
   - Automatic toast alerts upon return from Stripe (`?billing=success` or `?billing=canceled`).

---

## 5. Testing with Stripe Test Cards

In Test Mode (`sk_test_...`), use Stripe's official test card details:
- **Card Number:** `4242 •••• •••• 4242`
- **Expiry:** Any future month/year (e.g. `12/28`)
- **CVC:** Any 3 digits (e.g. `123`)
- **Billing ZIP / Postal Code:** Any valid ZIP code (e.g. `90210` or `01000`)
