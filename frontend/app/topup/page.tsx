"use client";

import { useRouter } from "next/navigation";
import { PageHeader, PricingCard, SubscriptionCard } from "./components";
import { PAYMENT_PLANS } from "../../../lambda/src/shared/payment-plans";

export default function TopUpPage() {
    const router = useRouter();

    const handleClaim = (planId: string) => {
        router.push(`/topup/checkout?planId=${planId}`);
    };

    return (
        <main>
            <div className="max-w-8xl mx-auto">
                <PageHeader />

                <div className="flex gap-14 justify-center items-start">
                    <div className="grid grid-cols-3 gap-3 w-full">
                        {Object.values(PAYMENT_PLANS).map((plan) => (
                            <PricingCard
                                key={plan.id}
                                planId={plan.id}
                                minutes={plan.durationMinutes.toString()}
                                price={`$${(plan.priceCents / 100).toFixed(2)}`}
                                badge={plan.name}
                                buttonText="Claim"
                                onClaim={handleClaim}
                            />
                        ))}
                    </div>

                    <div className="w-80">
                        <SubscriptionCard
                            title="Flexible"
                            subtitle="Auto Replenish"
                            price="$0.10"
                            priceUnit="/minute"
                            features={[
                                "15% OFF every play",
                                "Flexible Time Amount",
                                "Worry free game play",
                                "Play before Pay",
                                "Weekly billing plan",
                            ]}
                            buttonText="Set Up"
                        />
                    </div>
                </div>
            </div>
        </main>
    );
}
