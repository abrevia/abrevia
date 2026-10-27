// Abrevia 1 — Stripe Webhook Event Listener
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Need raw body for Stripe signature validation on Vercel
export const config = {
    api: {
        bodyParser: false,
    },
};

async function getRawBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeKey) {
        return res.status(500).json({ error: 'STRIPE_SECRET_KEY missing.' });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' });
    let event;

    try {
        const rawBody = await getRawBody(req);

        if (webhookSecret) {
            const sig = req.headers['stripe-signature'];
            event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
        } else {
            // Development fallback without signature verification
            event = JSON.parse(rawBody.toString('utf8'));
        }
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Connect Supabase if configured
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let supabase = null;
    if (supabaseUrl && supabaseKey) {
        supabase = createClient(supabaseUrl, supabaseKey);
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                console.log(`[Stripe] Checkout Session completed for customer: ${session.customer_email || session.customer}`);
                // If Supabase table subscriptions exists, record or log
                if (supabase) {
                    await supabase.from('subscriptions').upsert({
                        stripe_customer_id: session.customer,
                        customer_email: session.customer_details?.email || session.customer_email,
                        subscription_id: session.subscription || null,
                        plan: session.metadata?.plan || 'pro',
                        status: 'active',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'stripe_customer_id' }).catch(() => {
                        // Table may not exist yet in early development
                    });
                }
                break;
            }

            case 'customer.subscription.updated':
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                console.log(`[Stripe] Subscription ${subscription.id} status changed to ${subscription.status}`);
                if (supabase) {
                    await supabase.from('subscriptions').update({
                        status: subscription.status,
                        updated_at: new Date().toISOString()
                    }).eq('subscription_id', subscription.id).catch(() => {});
                }
                break;
            }

            default:
                console.log(`[Stripe] Unhandled event type: ${event.type}`);
        }

        return res.status(200).json({ received: true });
    } catch (err) {
        console.error('Webhook processing error:', err);
        return res.status(500).json({ error: 'Webhook processing failed.' });
    }
}
