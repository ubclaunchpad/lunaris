import {
    getStripe,
    resetStripeInstance,
    constructWebhookEvent,
    findOrCreateCustomer,
} from "../../src/utils/stripeWrapper";
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

    describe("constructWebhookEvent", () => {
        it("should delegate to stripe.webhooks.constructEvent", () => {
            process.env.STRIPE_SECRET_KEY = mockStripeKey;

            const mockEvent = { id: "evt_123", type: "checkout.session.completed" };
            const mockConstructEvent = jest.fn().mockReturnValue(mockEvent);

            // Get the mocked Stripe instance and set up webhooks mock
            const stripeInstance = getStripe();
            (stripeInstance as any).webhooks = {
                constructEvent: mockConstructEvent,
            };

            const result = constructWebhookEvent("raw_body", "sig_header", "whsec_test");

            expect(mockConstructEvent).toHaveBeenCalledWith("raw_body", "sig_header", "whsec_test");
            expect(result).toEqual(mockEvent);
        });

        it("should propagate errors from signature verification", () => {
            process.env.STRIPE_SECRET_KEY = mockStripeKey;

            const mockConstructEvent = jest.fn().mockImplementation(() => {
                throw new Error("Signature verification failed");
            });

            const stripeInstance = getStripe();
            (stripeInstance as any).webhooks = {
                constructEvent: mockConstructEvent,
            };

            expect(() => constructWebhookEvent("bad_body", "bad_sig", "whsec_test")).toThrow(
                "Signature verification failed",
            );
        });
    });

    describe("findOrCreateCustomer", () => {
        it("should return existing customer ID when found", async () => {
            process.env.STRIPE_SECRET_KEY = mockStripeKey;

            const mockSearch = jest.fn().mockResolvedValue({
                data: [{ id: "cus_existing_123" }],
            });
            const mockCreate = jest.fn();

            const stripeInstance = getStripe();
            (stripeInstance as any).customers = {
                search: mockSearch,
                create: mockCreate,
            };

            const result = await findOrCreateCustomer("user-456");

            expect(mockSearch).toHaveBeenCalledWith({
                query: "metadata['userId']:'user-456'",
                limit: 1,
            });
            expect(mockCreate).not.toHaveBeenCalled();
            expect(result).toBe("cus_existing_123");
        });

        it("should create new customer when not found", async () => {
            process.env.STRIPE_SECRET_KEY = mockStripeKey;

            const mockSearch = jest.fn().mockResolvedValue({ data: [] });
            const mockCreate = jest.fn().mockResolvedValue({ id: "cus_new_789" });

            const stripeInstance = getStripe();
            (stripeInstance as any).customers = {
                search: mockSearch,
                create: mockCreate,
            };

            const result = await findOrCreateCustomer("user-789", "test@example.com");

            expect(mockSearch).toHaveBeenCalled();
            expect(mockCreate).toHaveBeenCalledWith({
                metadata: { userId: "user-789" },
                email: "test@example.com",
            });
            expect(result).toBe("cus_new_789");
        });
    });
});
