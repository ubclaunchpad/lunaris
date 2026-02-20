import { getStripe, resetStripeInstance } from "../../src/utils/stripeWrapper";
import Stripe from "stripe";

// Mock the Stripe constructor
jest.mock("stripe");

describe("StripeWrapper", () => {
    const originalEnv = process.env;
    const mockStripeKey = "sk_test_mock_key_12345";

    beforeEach(() => {
        // Reset modules and environment before each test
        jest.clearAllMocks();
        resetStripeInstance();
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        // Restore original environment
        process.env = originalEnv;
    });

    describe("getStripe", () => {
        it("should create a Stripe instance with the secret key from environment", () => {
            process.env.STRIPE_SECRET_KEY = mockStripeKey;

            const stripe = getStripe();

            expect(Stripe).toHaveBeenCalledWith(mockStripeKey, {
                apiVersion: "2025-02-24.acacia",
            });
            expect(stripe).toBeInstanceOf(Stripe);
        });

        it("should return cached singleton instance on subsequent calls", () => {
            process.env.STRIPE_SECRET_KEY = mockStripeKey;

            const stripe1 = getStripe();
            const stripe2 = getStripe();

            // Stripe constructor should only be called once
            expect(Stripe).toHaveBeenCalledTimes(1);
            expect(stripe1).toBe(stripe2);
        });

        it("should throw error if STRIPE_SECRET_KEY environment variable is not set", () => {
            delete process.env.STRIPE_SECRET_KEY;

            expect(() => getStripe()).toThrow("STRIPE_SECRET_KEY environment variable is not set");
        });

        it("should throw error if STRIPE_SECRET_KEY is empty string", () => {
            process.env.STRIPE_SECRET_KEY = "";

            expect(() => getStripe()).toThrow("STRIPE_SECRET_KEY environment variable is not set");
        });

        it("should create new instance after reset", () => {
            process.env.STRIPE_SECRET_KEY = mockStripeKey;

            const stripe1 = getStripe();
            resetStripeInstance();
            const stripe2 = getStripe();

            // Stripe constructor should be called twice (once for each instance)
            expect(Stripe).toHaveBeenCalledTimes(2);
            expect(stripe1).not.toBe(stripe2);
        });
    });

    describe("resetStripeInstance", () => {
        it("should clear the cached instance", () => {
            process.env.STRIPE_SECRET_KEY = mockStripeKey;

            getStripe();
            expect(Stripe).toHaveBeenCalledTimes(1);

            resetStripeInstance();
            getStripe();

            expect(Stripe).toHaveBeenCalledTimes(2);
        });
    });
});
