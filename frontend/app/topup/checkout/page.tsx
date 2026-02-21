"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CheckoutForm } from "../components";

function CheckoutContent() {
    const searchParams = useSearchParams();
    const planId = searchParams.get("planId");

    if (!planId) {
        return (
            <main className="pt-40 px-8">
                <div className="max-w-3xl mx-auto text-center">
                    <h1 className="text-white text-3xl font-bold mb-4 font-space-grotesk">
                        Missing plan
                    </h1>
                    <p className="text-white/70 font-space-grotesk">
                        No plan was selected. Please go back and choose a plan.
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main className="pt-40 px-8 pb-20">
            <div className="max-w-3xl mx-auto">
                <h1 className="text-white text-3xl font-bold mb-8 font-space-grotesk text-center">
                    Complete your purchase
                </h1>
                <CheckoutForm planId={planId} />
            </div>
        </main>
    );
}

export default function CheckoutPage() {
    return (
        <Suspense
            fallback={
                <main className="pt-40 px-8">
                    <div className="max-w-3xl mx-auto text-center">
                        <p className="text-white/70 font-space-grotesk">Loading checkout…</p>
                    </div>
                </main>
            }
        >
            <CheckoutContent />
        </Suspense>
    );
}
