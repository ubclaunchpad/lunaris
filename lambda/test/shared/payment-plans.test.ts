import {
    PAYMENT_PLANS,
    PaymentPlan,
    getPaymentPlanById,
    validatePlanId,
} from "../../src/shared/payment-plans";

describe("PaymentPlans", () => {
    describe("PAYMENT_PLANS constant", () => {
        it("should have exactly 5 payment plans defined", () => {
            const planCount = Object.keys(PAYMENT_PLANS).length;
            expect(planCount).toBe(5);
        });

        it("should have unique IDs for each plan", () => {
            const ids = Object.values(PAYMENT_PLANS).map((plan) => plan.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
        });

        it("should have positive priceCents for all plans", () => {
            Object.values(PAYMENT_PLANS).forEach((plan) => {
                expect(plan.priceCents).toBeGreaterThan(0);
            });
        });

        it("should have positive coins for all plans", () => {
            Object.values(PAYMENT_PLANS).forEach((plan) => {
                expect(plan.coins).toBeGreaterThan(0);
            });
        });

        it("should have prices and coins ascending together", () => {
            const plans = Object.values(PAYMENT_PLANS);

            // Sort by coins ascending
            const sortedByCoins = [...plans].sort((a, b) => a.coins - b.coins);
            // Sort by price ascending
            const sortedByPrice = [...plans].sort((a, b) => a.priceCents - b.priceCents);

            // Both should produce the same order
            expect(sortedByCoins).toEqual(sortedByPrice);
        });

        it("should have all required fields for each plan", () => {
            Object.values(PAYMENT_PLANS).forEach((plan) => {
                expect(plan).toHaveProperty("id");
                expect(plan).toHaveProperty("name");
                expect(plan).toHaveProperty("coins");
                expect(plan).toHaveProperty("priceCents");
                expect(plan).toHaveProperty("description");
                expect(plan).toHaveProperty("durationMinutes");

                expect(typeof plan.id).toBe("string");
                expect(typeof plan.name).toBe("string");
                expect(typeof plan.coins).toBe("number");
                expect(typeof plan.priceCents).toBe("number");
                expect(typeof plan.description).toBe("string");
                expect(typeof plan.durationMinutes).toBe("number");
            });
        });
    });

    describe("getPaymentPlanById", () => {
        it("should return the correct plan for STARTER", () => {
            const plan = getPaymentPlanById("STARTER");
            expect(plan).toBeDefined();
            expect(plan?.id).toBe("STARTER");
            expect(plan?.coins).toBe(100);
            expect(plan?.priceCents).toBe(299);
        });

        it("should return the correct plan for BASIC", () => {
            const plan = getPaymentPlanById("BASIC");
            expect(plan).toBeDefined();
            expect(plan?.id).toBe("BASIC");
            expect(plan?.coins).toBe(300);
            expect(plan?.priceCents).toBe(699);
        });

        it("should return the correct plan for STANDARD", () => {
            const plan = getPaymentPlanById("STANDARD");
            expect(plan).toBeDefined();
            expect(plan?.id).toBe("STANDARD");
            expect(plan?.coins).toBe(600);
            expect(plan?.priceCents).toBe(999);
        });

        it("should return the correct plan for PREMIUM", () => {
            const plan = getPaymentPlanById("PREMIUM");
            expect(plan).toBeDefined();
            expect(plan?.id).toBe("PREMIUM");
            expect(plan?.coins).toBe(1500);
            expect(plan?.priceCents).toBe(2199);
        });

        it("should return the correct plan for PRO", () => {
            const plan = getPaymentPlanById("PRO");
            expect(plan).toBeDefined();
            expect(plan?.id).toBe("PRO");
            expect(plan?.coins).toBe(3600);
            expect(plan?.priceCents).toBe(4299);
        });

        it("should return undefined for invalid plan ID", () => {
            const plan = getPaymentPlanById("INVALID_PLAN");
            expect(plan).toBeUndefined();
        });

        it("should return undefined for empty string", () => {
            const plan = getPaymentPlanById("");
            expect(plan).toBeUndefined();
        });
    });

    describe("validatePlanId", () => {
        it("should return true for valid plan ID STARTER", () => {
            expect(validatePlanId("STARTER")).toBe(true);
        });

        it("should return true for valid plan ID BASIC", () => {
            expect(validatePlanId("BASIC")).toBe(true);
        });

        it("should return true for valid plan ID STANDARD", () => {
            expect(validatePlanId("STANDARD")).toBe(true);
        });

        it("should return true for valid plan ID PREMIUM", () => {
            expect(validatePlanId("PREMIUM")).toBe(true);
        });

        it("should return true for valid plan ID PRO", () => {
            expect(validatePlanId("PRO")).toBe(true);
        });

        it("should return false for invalid plan ID", () => {
            expect(validatePlanId("INVALID_PLAN")).toBe(false);
        });

        it("should return false for empty string", () => {
            expect(validatePlanId("")).toBe(false);
        });

        it("should return false for lowercase plan ID", () => {
            expect(validatePlanId("starter")).toBe(false);
        });
    });
});
