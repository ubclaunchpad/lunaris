"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import apiClient from "@/lib/api-client";
import { Button } from "@/components/ui/button";

interface SessionInfo {
    status: string | null;
    paymentStatus: string;
    customerEmail: string | null;
    amountTotal: number | null;
}

function ReturnContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const sessionId = searchParams.get("session_id");
    const [session, setSession] = useState<SessionInfo | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!sessionId) {
            setLoading(false);
            return;
        }

        apiClient
            .getCheckoutSessionStatus({ sessionId })
            .then((data) => {
                setSession({
                    status: data.status,
                    paymentStatus: data.paymentStatus,
                    customerEmail: data.customerEmail,
                    amountTotal: data.amountTotal,
                });

                // if session is still open (payment failed / was cancelled), redirect back to the checkout page so user can retry
                if (data.status === "open") {
                    router.replace("/topup");
                }
            })
            .catch((err) => {
                console.error("Failed to fetch session status:", err);
            })
            .finally(() => setLoading(false));
    }, [sessionId, router]);

    if (loading) {
        return (
            <p className="text-white/70 font-space-grotesk text-center">
                Verifying payment…
            </p>
        );
    }

    if (!sessionId || !session) {
        return (
            <div className="text-center">
                <h1 className="text-white text-3xl font-bold mb-4 font-space-grotesk">
                    No session found
                </h1>
                <p className="text-white/70 mb-8 font-space-grotesk">
                    We couldn&apos;t find a checkout session. Please try again.
                </p>
                <Button
                    onClick={() => router.push("/topup")}
                    className="rounded-2xl px-6 py-3 border bg-[rgba(230,218,246,0.1)] border-[#e1ff9a] text-[#fbfff5] hover:bg-[rgba(230,218,246,0.2)] font-space-grotesk"
                >
                    Back to Top Up
                </Button>
            </div>
        );
    }

    if (session.status === "complete") {
        return (
            <div className="text-center">
                <div className="mb-6 text-6xl">🎉</div>
                <h1 className="text-white text-3xl font-bold mb-4 font-space-grotesk">
                    Payment successful!
                </h1>
                {session.customerEmail && (
                    <p className="text-white/70 mb-2 font-space-grotesk">
                        A confirmation email has been sent to{" "}
                        <span className="text-white font-medium">{session.customerEmail}</span>.
                    </p>
                )}
                {session.amountTotal !== null && (
                    <p className="text-white/70 mb-8 font-space-grotesk">
                        Amount paid:{" "}
                        <span className="text-white font-medium">
                            ${(session.amountTotal / 100).toFixed(2)}
                        </span>
                    </p>
                )}
                <p className="text-white/50 text-sm mb-8 font-space-grotesk">
                    Your minutes have been added to your account.
                </p>
                <Button
                    onClick={() => router.push("/topup")}
                    className="rounded-2xl px-6 py-3 border bg-[rgba(230,218,246,0.1)] border-[#e1ff9a] text-[#fbfff5] hover:bg-[rgba(230,218,246,0.2)] font-space-grotesk"
                >
                    Back to Top Up
                </Button>
            </div>
        );
    }

    // Fallback for unexpected statuses
    return (
        <div className="text-center">
            <h1 className="text-white text-3xl font-bold mb-4 font-space-grotesk">
                Something went wrong
            </h1>
            <p className="text-white/70 mb-8 font-space-grotesk">
                Payment status: {session.paymentStatus}
            </p>
            <Button
                onClick={() => router.push("/topup")}
                className="rounded-2xl px-6 py-3 border bg-[rgba(230,218,246,0.1)] border-[#e1ff9a] text-[#fbfff5] hover:bg-[rgba(230,218,246,0.2)] font-space-grotesk"
            >
                Try Again
            </Button>
        </div>
    );
}

export default function ReturnPage() {
    return (
        <main className="pt-40 px-8 pb-20">
            <div className="max-w-3xl mx-auto">
                <Suspense
                    fallback={
                        <p className="text-white/70 font-space-grotesk text-center">
                            Loading…
                        </p>
                    }
                >
                    <ReturnContent />
                </Suspense>
            </div>
        </main>
    );
}
