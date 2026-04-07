export interface PaymentPlan {
    id: string;
    name: string;
    coins: number;
    priceCents: number;
    description: string;
    durationMinutes: number;
}

export const PAYMENT_PLANS = {
    STARTER: {
        id: "STARTER",
        name: "Starter Pack",
        coins: 100,
        priceCents: 299,
        description: "Perfect for a quick gaming session",
        durationMinutes: 10,
    },
    BASIC: {
        id: "BASIC",
        name: "Basic Pack",
        coins: 300,
        priceCents: 699,
        description: "A solid half-hour session",
        durationMinutes: 30,
    },
    STANDARD: {
        id: "STANDARD",
        name: "Standard Pack",
        coins: 600,
        priceCents: 999,
        description: "A full hour of gaming",
        durationMinutes: 60,
    },
    PREMIUM: {
        id: "PREMIUM",
        name: "Premium Pack",
        coins: 1500,
        priceCents: 2199,
        description: "Extended gaming session",
        durationMinutes: 150,
    },
    PRO: {
        id: "PRO",
        name: "Pro Pack",
        coins: 3600,
        priceCents: 4299,
        description: "The ultimate gaming marathon",
        durationMinutes: 360,
    },
} as const satisfies Record<string, PaymentPlan>;

export type PlanId = keyof typeof PAYMENT_PLANS;
