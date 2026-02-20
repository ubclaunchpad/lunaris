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
