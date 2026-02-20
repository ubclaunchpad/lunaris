export interface PaymentPlan {
    id: string;
    name: string;
    coins: number;
    priceCents: number;
    description: string;
    durationMinutes: number;
    stripePriceId: string | undefined; // TODO: maybe should throw error if undefined env
}


// TODO: fix this payment plan to match the actual stripe plan
export const PAYMENT_PLANS = {
    FREE_60: {
        id: "FREE_60",
        name: "New Player Award",
        coins: 0,
        priceCents: 0,
        description: "60 free minutes for new players",
        durationMinutes: 60,
        stripePriceId: process.env.STRIPE_PRICE_FREE_60,
    },
    BASIC_120: {
        id: "BASIC_120",
        name: "120 + 20 Minutes",
        coins: 300,
        priceCents: 1200,
        description: "120 minutes plus 20 bonus minutes",
        durationMinutes: 140,
        stripePriceId: process.env.STRIPE_PRICE_BASIC_120,
    },
    STANDARD_240: {
        id: "STANDARD_240",
        name: "240 + 50 Minutes",
        coins: 600,
        priceCents: 1200,
        description: "240 minutes plus 50 bonus minutes",
        durationMinutes: 290,
        stripePriceId: process.env.STRIPE_PRICE_STANDARD_240,
    },
    PREMIUM_480: {
        id: "PREMIUM_480",
        name: "480 + 100 Minutes",
        coins: 1500,
        priceCents: 1200,
        description: "480 minutes plus 100 bonus minutes",
        durationMinutes: 580,
        stripePriceId: process.env.STRIPE_PRICE_PREMIUM_480,
    },
} as const satisfies Record<string, PaymentPlan>;

export type PlanId = keyof typeof PAYMENT_PLANS;

export const getPaymentPlanById = (planId: string): PaymentPlan | undefined =>
    PAYMENT_PLANS[planId as PlanId];

export const validatePlanId = (planId: string): planId is PlanId => planId in PAYMENT_PLANS;