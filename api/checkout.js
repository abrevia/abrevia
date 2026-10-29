// Abrevia — Stripe Checkout Session Handler
const PACK_PAYMENT_LINKS = {
    'pack_5': 'https://buy.stripe.com/6oU5kDf5U7sh57S9GI8Vi09?locale=en',
    'pack_10': 'https://buy.stripe.com/dRm14n6zo13T1VGbOQ8Vi0a?locale=en',
    'pack_20': 'https://buy.stripe.com/3cI7sL4rg6odcAk1ac8Vi0b?locale=en',
    'pack_30': 'https://buy.stripe.com/4gMaEX3nccMBfMwg568Vi0c?locale=en',
    'credits': 'https://buy.stripe.com/3cI7sL4rg6odcAk1ac8Vi0b?locale=en',
    'pro': 'https://buy.stripe.com/5kQ6oHe1Q8wlcAk7yA8Vi08?locale=en'
};

const PACK_PRICES = {
    'pack_5': { priceId: 'price_1UVkKwE1uOSjePxYn7i9ZYyB', amount: 500, name: '100 Messages Pack', count: 100 },
    'pack_10': { priceId: 'price_1UVkKxE1uOSjePxYPxoBSkuS', amount: 1000, name: '250 Messages Pack', count: 250 },
    'pack_20': { priceId: 'price_1UVkKyE1uOSjePxYd6u4bkdK', amount: 2000, name: '500 Messages Pack', count: 500 },
    'pack_30': { priceId: 'price_1UVkKzE1uOSjePxYPu0z4k5N', amount: 3000, name: '1,000 Messages Pack', count: 1000 },
    'credits': { priceId: 'price_1UVkKyE1uOSjePxYd6u4bkdK', amount: 2000, name: '500 Messages Pack', count: 500 }
};

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
    const { plan = 'pro', customerEmail, successUrl, cancelUrl, locale = 'en', customerId, returnUrl, action } = req.body || {};

    const host = req.headers.host || 'abrevia-beta.vercel.app';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const defaultSuccessUrl = `${protocol}://${host}/dashboard.html?billing=success`;
    const defaultCancelUrl = `${protocol}://${host}/dashboard.html?billing=canceled`;

    // Stripe Customer Portal Handler (integrated from customer-portal.js)
    if (action === 'portal' || customerId || req.url?.includes('customer-portal')) {
        if (!stripeKey) {
            return res.status(400).json({ error: 'STRIPE_SECRET_KEY not configured in environment variables.' });
        }
        if (!customerId) {
            return res.status(400).json({
                error: 'Stripe Customer ID is required to open the Customer Portal. Subscribe first via checkout.'
            });
        }
        const defaultReturnUrl = `${protocol}://${host}/dashboard.html`;
        try {
            const portalBody = new URLSearchParams();
            portalBody.append('customer', customerId);
            portalBody.append('return_url', returnUrl || defaultReturnUrl);

            const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${stripeKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: portalBody.toString()
            });

            const portalData = await portalRes.json();
            if (portalData.error) {
                return res.status(400).json({ error: portalData.error.message });
            }
            return res.status(200).json({ url: portalData.url });
        } catch (portalErr) {
            console.error('Stripe Portal Error:', portalErr.message);
            return res.status(500).json({ error: portalErr.message });
        }
    }

    // Direct fallback if user provided a Stripe Payment Link
    if (plan === 'payment_link' && PACK_PAYMENT_LINKS.pro) {
        return res.status(200).json({ url: PACK_PAYMENT_LINKS.pro });
    }

    // Direct fallback payment link
    const directLink = PACK_PAYMENT_LINKS[plan] || PACK_PAYMENT_LINKS.pro;

    if (!stripeKey) {
        if (directLink) {
            return res.status(200).json({ url: directLink });
        }
        return res.status(400).json({
            error: 'Stripe API key (STRIPE_SECRET_KEY) is not yet configured in environment variables.',
            requiresKey: true
        });
    }

    try {
        const body = new URLSearchParams();
        body.append('success_url', successUrl || defaultSuccessUrl);
        body.append('cancel_url', cancelUrl || defaultCancelUrl);
        body.append('locale', locale || 'en'); // Explicit English display
        body.append('allow_promotion_codes', 'true');
        body.append('billing_address_collection', 'auto');
        body.append('metadata[app]', 'abrevia');
        body.append('metadata[plan]', plan);
        if (customerEmail) body.append('customer_email', customerEmail);

        if (PACK_PRICES[plan]) {
            const pack = PACK_PRICES[plan];
            body.append('mode', 'payment');
            body.append('line_items[0][price]', pack.priceId);
            body.append('line_items[0][quantity]', '1');
            body.append('metadata[messageCount]', String(pack.count));
        } else {
            // Subscription: Operations Pro ($49/mo)
            body.append('mode', 'subscription');
            if (process.env.STRIPE_MONTHLY_PRICE_ID) {
                body.append('line_items[0][price]', process.env.STRIPE_MONTHLY_PRICE_ID);
            } else {
                body.append('line_items[0][price_data][currency]', 'usd');
                body.append('line_items[0][price_data][unit_amount]', '4900');
                body.append('line_items[0][price_data][recurring][interval]', 'month');
                body.append('line_items[0][price_data][product_data][name]', 'Abrevia Operations Pro');
                body.append('line_items[0][price_data][product_data][description]', 'Unlimited two-way bilingual WhatsApp & message relay, Title VI audit logging, and pre-signed HIPAA BAA.');
            }
            body.append('line_items[0][quantity]', '1');
        }

        const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${stripeKey}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body.toString()
        });

        const data = await stripeRes.json();
        if (data.url) {
            return res.status(200).json({ url: data.url, sessionId: data.id });
        } else {
            console.error('Stripe session create error, using direct link:', data.error);
            if (directLink) {
                return res.status(200).json({ url: directLink });
            }
            return res.status(500).json({ error: data.error?.message || 'Failed to create checkout session' });
        }

    } catch (err) {
        console.error('Stripe Checkout Error, falling back to direct payment link:', err.message);
        if (directLink) {
            return res.status(200).json({ url: directLink });
        }
        return res.status(500).json({ error: err.message });
    }
}
