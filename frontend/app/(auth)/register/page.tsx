import { auth } from "@/auth";
import { AuthForm } from "@/components/auth-form";
import { redirect } from "next/navigation";

export default async function RegisterPage({
    searchParams,
}: {
    searchParams: Promise<{ callbackUrl?: string; email?: string }>;
}) {
    const session = await auth();
    const { callbackUrl, email } = await searchParams;

    if (session) {
        redirect(callbackUrl || "/browse");
    }

    return <AuthForm mode="register" callbackUrl={callbackUrl} initialEmail={email} />;
}
