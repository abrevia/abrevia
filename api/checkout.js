// Abrevia 1 — Stripe Checkout Session Handler
import Stripe from 'stripe';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const paymentLinkPro = process.env.STRIPE_PAYMENT_LINK_PRO || 'https://buy.stripe.com/5kQ6oHe1Q8wlcAk7yA8Vi08';
    const { plan = 'pro', customerEmail, successUrl, cancelUrl } = req.body || {};

    const host = req.headers.host || 'abrevia-beta.vercel.app';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const defaultSuccessUrl = `${protocol}://${host}/dashboard.html?billing=success`;
    const defaultCancelUrl = `${protocol}://${host}/dashboard.html?billing=canceled`;

    // Direct fallback if user provided a Stripe Payment Link
    if (plan === 'payment_link' && paymentLinkPro) {
        return res.status(200).json({ url: paymentLinkPro });
    }

    if (!stripeKey) {
        // Graceful fallback if Stripe key is not yet configured in environment variables
        if (paymentLinkPro) {
            return res.status(200).json({ url: paymentLinkPro });
        }
        return res.status(400).json({
            error: 'Stripe API key (STRIPE_SECRET_KEY) is not yet configured in environment variables.',
            requiresKey: true
        });
    }

    try {
        const stripe = new Stripe(stripeKey, {
            apiVersion: '2024-12-18.acacia'
        });

        let sessionConfig = {
            payment_method_types: ['card'],
            billing_address_collection: 'auto',
            success_url: successUrl || defaultSuccessUrl,
            cancel_url: cancelUrl || defaultCancelUrl,
            customer_email: customerEmail || undefined,
            allow_promotion_codes: true,
            metadata: {
                app: 'abrevia-1',
                plan: plan
            }
        };

        if (plan === 'credits') {
            // One-time payment: 500 SMS Credit Pack ($20 USD)
            if (process.env.STRIPE_CREDITS_PRICE_ID) {
                sessionConfig.line_items = [{
                    price: process.env.STRIPE_CREDITS_PRICE_ID,
                    quantity: 1
                }];
            } else {
                sessionConfig.line_items = [{
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: 'Abrevia 500 SMS Relay Credit Pack',
                            description: '500 Bilingual SMS messages with real-time Gemini AI translation & Human-in-the-loop review.'
                        },
                        unit_amount: 2000 // $20.00 USD
                    },
                    quantity: 1
                }];
            }
            sessionConfig.mode = 'payment';
        } else {
            // Monthly Subscription: Operations Pro ($49/mo)
            if (process.env.STRIPE_MONTHLY_PRICE_ID) {
                sessionConfig.line_items = [{
                    price: process.env.STRIPE_MONTHLY_PRICE_ID,
                    quantity: 1
                }];
            } else {
                sessionConfig.line_items = [{
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: 'Abrevia Operations Pro',
                            description: 'Unlimited bilingual SMS relay, Human-in-the-loop review, MMS attachments & persistent latent channels.'
                        },
                        unit_amount: 4900, // $49.00 USD / month
                        recurring: {
                            interval: 'month'
                        }
                    },
                    quantity: 1
                }];
            }
            sessionConfig.mode = 'subscription';
        }

        const session = await stripe.checkout.sessions.create(sessionConfig);
        return res.status(200).json({ url: session.url, sessionId: session.id });

    } catch (err) {
        console.error('Stripe Checkout Error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
