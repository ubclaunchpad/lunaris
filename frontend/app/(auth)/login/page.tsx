import { auth } from "@/auth";
import { AuthForm } from "@/components/auth-form";
import { redirect } from "next/navigation";

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{
        callbackUrl?: string;
        registered?: string;
        email?: string;
    }>;
}) {
    const session = await auth();
    const { callbackUrl, registered, email } = await searchParams;

    if (session) {
        redirect(callbackUrl || "/browse");
    }

    return (
        <AuthForm
            mode="login"
            callbackUrl={callbackUrl}
            initialEmail={email}
            notice={registered === "1" ? "Account created. You can sign in now." : ""}
        />
    );
}
