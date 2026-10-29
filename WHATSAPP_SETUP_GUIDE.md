# Meta WhatsApp Cloud API Setup Guide for Abrevia

This guide walks you through connecting your **Meta WhatsApp Cloud API** to Abrevia so Point A (English Operator on Abrevia) communicates directly with Point B (Spanish Speaker on native WhatsApp) with zero per-minute fees.

---

## Step 1: Create a Meta Developer Account & App

1. Go to [developers.facebook.com](https://developers.facebook.com/) and log in with your Facebook account.
2. Click **My Apps** (top right) &rarr; **Create App**.
3. When asked *"What do you want your app to do?"*, select **Other** &rarr; click **Next**.
4. Select App Type: **Business** &rarr; click **Next**.
5. Enter an **App Name** (e.g., `Abrevia Relay`) and link your Business Account &rarr; click **Create App**.

---

## Step 2: Add WhatsApp to Your App

1. In the App Dashboard sidebar, find **WhatsApp** and click **Set up**.
2. Under the left menu, go to **WhatsApp** &rarr; **API Setup** (or Quickstart).
3. You will immediately see:
   * **Test Phone Number:** Meta provides a free test number to start sending right away.
   * **Phone Number ID:** (A string of numbers like `104829104819201`). **Copy this!**
   * **WhatsApp Business Account ID:** (e.g., `109283748291048`).
   * **Temporary Access Token:** (Valid for 24 hours).

---

## Step 3: Configure the Webhook (Receive Incoming WhatsApp Messages)

This is how Point B's Spanish replies in WhatsApp land live into Abrevia:

1. In your Meta App sidebar, go to **WhatsApp** &rarr; **Configuration**.
2. In the **Webhook** section, click **Edit**:
   * **Callback URL:** `https://abrevia-beta.vercel.app/api/whatsapp-webhook`
   * **Verify Token:** `abrevia_webhook_secret` (or your chosen secret).
3. Click **Verify and Save**. Meta will send a handshake to Abrevia, which responds instantly with HTTP 200.
4. Under **Webhook Fields**, click **Manage** &rarr; click **Subscribe** on the **`messages`** row &rarr; click **Done**.

---

## Step 4: Add Environment Variables in Vercel & `.env`

Add these keys to your `.env` and in [Vercel Project Settings &rarr; Environment Variables](https://vercel.com):

```env
# Meta WhatsApp Cloud API
META_WHATSAPP_TOKEN=EAAG...your_meta_token_here...
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
WHATSAPP_VERIFY_TOKEN=abrevia_webhook_secret
```

*(Note: While these keys are being set up, Abrevia automatically uses SMS as fallback, so you never lose communication).*

---

## Step 5: (Optional) Permanent System User Token

For 24/7 production without renewing the 24-hour token:
1. Go to [business.facebook.com/settings](https://business.facebook.com/settings).
2. Under **Users** &rarr; click **System Users** &rarr; click **Add** (Name: `Abrevia Cloud`, Role: `Admin`).
3. Click **Generate New Token** &rarr; select your App &rarr; check **`whatsapp_business_messaging`** & **`whatsapp_business_management`**.
4. Copy the permanent token and save it as `META_WHATSAPP_TOKEN`.

---

## How It Works in Practice

1. **Operator (Point A):** Composes in English on Abrevia.
2. **Abrevia Engine:** Translates English to Spanish (via AWS Translate under HIPAA BAA or Gemini).
3. **Dispatch:** Calls Meta WhatsApp Cloud API to send directly to Point B's WhatsApp.
4. **Recipient (Point B):** Sees message in Spanish in their native WhatsApp app.
5. **Point B Replies:** Types in Spanish in WhatsApp.
6. **Webhook:** Abrevia receives the webhook, translates to English, and displays live on your dashboard with an audio chime!
