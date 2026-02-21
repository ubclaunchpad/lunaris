"use client";

import { useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import apiClient from "@/lib/api-client";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

interface CheckoutFormProps {
    planId: string;
    userId?: string;
}

export function CheckoutForm({ planId, userId }: CheckoutFormProps) {
    const fetchClientSecret = useCallback(async () => {
        const response = await apiClient.createCheckoutSession({ planId, userId });
        return response.clientSecret;
    }, [planId, userId]);

    return (
        <div id="checkout" className="w-full">
            <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
                <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
        </div>
    );
}
