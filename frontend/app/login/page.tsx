import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ callbackUrl?: string }>;
}) {
    const session = await auth();
    const { callbackUrl } = await searchParams;

    // If already logged in, redirect to callback or home
    if (session) {
        redirect(callbackUrl || "/browse");
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#040609]">
            <div className="max-w-md w-full space-y-8 p-8 bg-[#12191d] rounded-lg shadow-xl">
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-[#fbfff5]">Lunaris</h1>
                    <p className="mt-2 text-[#e6daf6]">Cloud Gaming Platform</p>
                </div>

                <form
                    action={async () => {
                        "use server";
                        await signIn("cognito", {
                            redirectTo: callbackUrl || "/browse",
                        });
                    }}
                >
                    <Button
                        type="submit"
                        className="w-full bg-[#e1ff9a] text-[#040609] hover:bg-[#d1ef8a]"
                        size="lg"
                    >
                        Sign in with Cognito
                    </Button>
                </form>
            </div>
        </div>
    );
}
