// Abrevia 1 — Stripe Customer Portal Handler
import Stripe from 'stripe';

export default async function handler(req, res) {
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
    const { customerId, returnUrl } = req.body || {};

    if (!stripeKey) {
        return res.status(400).json({ error: 'STRIPE_SECRET_KEY not configured.' });
    }

    const host = req.headers.host || 'abrevia-beta.vercel.app';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const defaultReturnUrl = `${protocol}://${host}/dashboard.html`;

    try {
        const stripe = new Stripe(stripeKey, {
            apiVersion: '2024-12-18.acacia'
        });

        if (!customerId) {
            // If customer ID is not passed, search by email or prompt to create one
            return res.status(400).json({
                error: 'Stripe Customer ID is required to open the Customer Portal. Subscribe first via checkout.'
            });
        }

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl || defaultReturnUrl
        });

        return res.status(200).json({ url: portalSession.url });

    } catch (err) {
        console.error('Stripe Portal Error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
