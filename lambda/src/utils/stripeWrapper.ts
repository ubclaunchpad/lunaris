import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export const getStripe = (): Stripe => {
    if (stripeInstance) return stripeInstance;

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key || key.trim() === "") {
        throw new Error("STRIPE_SECRET_KEY environment variable is not set");
    }

    stripeInstance = new Stripe(key, {
        apiVersion: "2025-02-24.acacia",
    });

    return stripeInstance;
};

export const resetStripeInstance = (): void => {
    stripeInstance = null;
};

// creates a stripe checkout session (in embedded mode)
export const createCheckoutSession = async (
    options: CreateCheckoutSessionProps,
): Promise<{ clientSecret: string; sessionId: string }> => {
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
        ui_mode: "embedded",
        line_items: [
            {
                price: options.priceId,
                quantity: options.quantity ?? 1,
            },
        ],
        mode: "payment",
        return_url: options.returnUrl,
        metadata: options.metadata,
        ...(options.customer ? { customer: options.customer } : {}),
    });

    if (!session.client_secret) {
        throw new Error("Stripe did not return a client_secret");
    }

    return {
        clientSecret: session.client_secret,
        sessionId: session.id,
    };
};

export const getCheckoutSession = async (
    sessionId: string,
): Promise<CheckoutSessionStatusProps> => {
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return {
        status: session.status,
        customerEmail: (session.customer_details && session.customer_details.email) ?? null,
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total,
    };
};

interface CreateCheckoutSessionProps {
    priceId: string;
    quantity?: number;
    returnUrl: string;
    metadata?: Record<string, string>;
    customer?: string;
}

interface CheckoutSessionStatusProps {
    status: string | null;
    customerEmail: string | null;
    paymentStatus: string;
    amountTotal: number | null;
}

export const constructWebhookEvent = (
    rawBody: string,
    signature: string,
    webhookSecret: string,
): Stripe.Event => {
    const stripe = getStripe();
    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
};

export const findOrCreateCustomer = async (userId: string, email?: string): Promise<string> => {
    const stripe = getStripe();
    const existing = await stripe.customers.search({
        query: `metadata['userId']:'${userId}'`,
        limit: 1,
    });

    if (existing.data.length > 0) return existing.data[0].id;

    const customer = await stripe.customers.create({
        metadata: {userId},
        ... (email ? {email}: {})
    });

    return customer.id;
};
