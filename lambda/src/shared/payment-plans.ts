export interface PaymentPlan {
    id: string;
    name: string;
    coins: number;
    priceCents: number;
    description: string;
    durationMinutes: number;
    stripePriceId: string | undefined; // TODO: maybe should throw error if undefined env
}

export const PAYMENT_PLANS = {
    STARTER: {
        id: "STARTER",
        name: "Starter Pack",
        coins: 100,
        priceCents: 299,
        description: "Perfect for a quick gaming session",
        durationMinutes: 10,
        stripePriceId: process.env.STRIPE_PRICE_STARTER,
    },
    BASIC: {
        id: "BASIC",
        name: "Basic Pack",
        coins: 300,
        priceCents: 699,
        description: "A solid half-hour session",
        durationMinutes: 30,
        stripePriceId: process.env.STRIPE_PRICE_BASIC,
    },
    STANDARD: {
        id: "STANDARD",
        name: "Standard Pack",
        coins: 600,
        priceCents: 999,
        description: "A full hour of gaming",
        durationMinutes: 60,
        stripePriceId: process.env.STRIPE_PRICE_STANDARD,
    },
    PREMIUM: {
        id: "PREMIUM",
        name: "Premium Pack",
        coins: 1500,
        priceCents: 2199,
        description: "Extended gaming session",
        durationMinutes: 150,
        stripePriceId: process.env.STRIPE_PRICE_PREMIUM,
    },
    PRO: {
        id: "PRO",
        name: "Pro Pack",
        coins: 3600,
        priceCents: 4299,
        description: "The ultimate gaming marathon",
        durationMinutes: 360,
        stripePriceId: process.env.STRIPE_PRICE_PRO,
    },
} as const satisfies Record<string, PaymentPlan>;

export type PlanId = keyof typeof PAYMENT_PLANS;

export const getPaymentPlanById = (planId: string): PaymentPlan | undefined =>
    PAYMENT_PLANS[planId as PlanId];

export const validatePlanId = (planId: string): planId is PlanId => planId in PAYMENT_PLANS;
