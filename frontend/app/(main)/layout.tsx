import { Suspense } from "react";
import { Navbar } from "@/components/navbar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <Suspense>
                <Navbar />
            </Suspense>
            <main className="relative z-0 min-h-screen pt-32 px-[58px]">
                <div
                    className="pointer-events-none fixed inset-0 -z-10"
                    aria-hidden="true"
                    style={{
                        backgroundColor: "#0a0e12",
                        backgroundImage:
                            "radial-gradient(ellipse 900px 900px at 80% 10%, rgba(113, 183, 206, 0.3) 0%, transparent 70%)," +
                            "radial-gradient(ellipse 1000px 1000px at 10% 90%, rgba(230, 218, 246, 0.25) 0%, transparent 75%)",
                        backgroundAttachment: "fixed",
                    }}
                />
                <div className="mx-auto max-w-6xl">
                    {children}
                </div>
            </main>
        </>
    );
}
