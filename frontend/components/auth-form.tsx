"use client";

import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { signup } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuthMode = "login" | "register";

interface AuthFormProps {
    mode: AuthMode;
    callbackUrl?: string;
    initialEmail?: string;
    notice?: string;
}

function buildHref(pathname: string, callbackUrl?: string, params?: Record<string, string>) {
    const searchParams = new URLSearchParams();

    if (callbackUrl) {
        searchParams.set("callbackUrl", callbackUrl);
    }

    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            searchParams.set(key, value);
        });
    }

    const queryString = searchParams.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
}

function getErrorMessage(error?: string | null, code?: string | null) {
    if (code === "invalid" || error === "CredentialsSignin") {
        return "Invalid email or password.";
    }
    return "Something went wrong. Please try again.";
}

export function AuthForm({ mode, callbackUrl, initialEmail = "", notice = "" }: AuthFormProps) {
    const router = useRouter();
    const [email, setEmail] = useState(initialEmail);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isLogin = mode === "login";
    const alternateHref = useMemo(
        () =>
            buildHref(isLogin ? "/register" : "/login", callbackUrl, {
                ...(isLogin ? {} : email ? { email } : {}),
            }),
        [callbackUrl, email, isLogin],
    );

    const title = isLogin ? "Welcome to your cloud gaming space." : "Create your account.";
    const prompt = isLogin ? "Don’t have an account?" : "Already have an account?";
    const alternateLabel = isLogin ? "Sign up" : "Login";
    const submitLabel = isLogin ? "Login" : "Create Account";

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (isSubmitting) {
            return;
        }

        setError("");
        setIsSubmitting(true);

        try {
            if (!isLogin && password !== confirmPassword) {
                setError("Passwords do not match.");
                return;
            }

            if (isLogin) {
                const result = await signIn("credentials", {
                    email,
                    password,
                    redirect: false,
                });

                if (result?.error) {
                    setError(getErrorMessage(result.error, result.code));
                    return;
                }

                router.replace(callbackUrl || "/browse");
                router.refresh();
                return;
            }

            const result = await signup(email, password);

            if (!result?.success) {
                setError(result?.message || "Unable to create your account.");
                return;
            }

            const signInResult = await signIn("credentials", {
                email,
                password,
                redirect: false,
            });

            if (signInResult?.error) {
                router.replace(buildHref("/login", callbackUrl, { registered: "1", email }));
                router.refresh();
                return;
            }

            router.replace(callbackUrl || "/browse");
            router.refresh();
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : "Something went wrong. Please try again.",
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="fixed inset-0 overflow-hidden bg-[#12191d]">
            <div
                className="absolute inset-0"
                aria-hidden="true"
                style={{
                    backgroundColor: "#12191d",
                    backgroundImage: [
                        "radial-gradient(circle at 78% 10%, rgba(103, 156, 173, 0.85) 0%, rgba(103, 156, 173, 0.16) 32%, rgba(18, 25, 29, 0) 58%)",
                        "radial-gradient(circle at 46% 96%, rgba(123, 148, 91, 0.5) 0%, rgba(123, 148, 91, 0.14) 28%, rgba(18, 25, 29, 0) 52%)",
                        "radial-gradient(circle at -10% 100%, rgba(227, 230, 225, 0.7) 0%, rgba(227, 230, 225, 0.12) 24%, rgba(18, 25, 29, 0) 46%)",
                        "linear-gradient(90deg, rgba(8, 10, 13, 0.98) 0%, rgba(17, 25, 29, 0.96) 24%, rgba(18, 25, 29, 0.9) 55%, rgba(17, 29, 35, 0.96) 100%)",
                    ].join(", "),
                }}
            />

            <div className="relative z-10 flex h-full items-center justify-center px-6 py-6 sm:px-10 sm:py-8">
                <div className="mx-auto flex h-full w-full max-w-[810px] items-center justify-center">
                    <div className="w-full text-center">
                        <div className="space-y-4">
                            <h1 className="text-3xl font-bold leading-[1.24] text-[#fbfff5] sm:text-[36px]">
                                {title}
                            </h1>

                            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-base leading-[1.5] text-[#fbfff5] sm:text-[20px]">
                                <span>{prompt}</span>
                                <Link
                                    href={alternateHref}
                                    className="font-bold text-[#bbdb9b] underline decoration-solid underline-offset-[3px]"
                                >
                                    {alternateLabel}
                                </Link>
                            </p>
                        </div>

                        <form
                            className="mx-auto mt-10 flex w-full max-w-[518px] flex-col gap-6 text-left sm:mt-9"
                            onSubmit={handleSubmit}
                        >
                            {notice && (
                                <div
                                    className="rounded-xl border border-[#bbdb9b]/35 bg-[#bbdb9b]/10 px-4 py-3 text-sm leading-6 text-[#fbfff5] sm:text-base"
                                    role="status"
                                >
                                    {notice}
                                </div>
                            )}

                            {error && (
                                <div
                                    className="rounded-xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm leading-6 text-[#fbfff5] sm:text-base"
                                    role="alert"
                                >
                                    {error}
                                </div>
                            )}

                            <div className="space-y-3">
                                <Label
                                    htmlFor={`${mode}-email`}
                                    className="text-lg font-medium leading-[1.2] text-[#fbfff5] sm:text-[20px]"
                                >
                                    Email
                                </Label>
                                <Input
                                    id={`${mode}-email`}
                                    type="email"
                                    placeholder="Enter your email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    autoComplete="email"
                                    required
                                    className="h-[54px] rounded-[12px] border border-[#9db4ab] bg-[#fbfff5] px-5 text-lg leading-[1.5] text-[#12191d] shadow-[8px_7px_20px_0_rgba(0,0,0,0.12)] placeholder:text-[#6b716e] focus-visible:border-[#bbdb9b] focus-visible:ring-[3px] focus-visible:ring-[#bbdb9b]/25 sm:text-[20px]"
                                />
                            </div>

                            <div className="space-y-3">
                                <Label
                                    htmlFor={`${mode}-password`}
                                    className="text-lg font-medium leading-[1.2] text-[#fbfff5] sm:text-[20px]"
                                >
                                    Password
                                </Label>
                                <div className="relative">
                                    <Input
                                        id={`${mode}-password`}
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Enter your password"
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        autoComplete={isLogin ? "current-password" : "new-password"}
                                        required
                                        className="h-[54px] rounded-[12px] border border-[#9db4ab] bg-[#fbfff5] px-5 pr-14 text-lg leading-[1.5] text-[#12191d] shadow-[8px_7px_20px_0_rgba(0,0,0,0.12)] placeholder:text-[#6b716e] focus-visible:border-[#bbdb9b] focus-visible:ring-[3px] focus-visible:ring-[#bbdb9b]/25 sm:text-[20px]"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((current) => !current)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6b716e] transition hover:text-[#12191d]"
                                        aria-label={
                                            showPassword ? "Hide password" : "Show password"
                                        }
                                    >
                                        {showPassword ? (
                                            <EyeOff className="h-5 w-5" />
                                        ) : (
                                            <Eye className="h-5 w-5" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            {!isLogin && (
                                <div className="space-y-3">
                                    <Label
                                        htmlFor="register-confirm-password"
                                        className="text-lg font-medium leading-[1.2] text-[#fbfff5] sm:text-[20px]"
                                    >
                                        Confirm Password
                                    </Label>
                                    <div className="relative">
                                        <Input
                                            id="register-confirm-password"
                                            type={showConfirmPassword ? "text" : "password"}
                                            placeholder="Confirm your password"
                                            value={confirmPassword}
                                            onChange={(event) =>
                                                setConfirmPassword(event.target.value)
                                            }
                                            autoComplete="new-password"
                                            required
                                            className="h-[54px] rounded-[12px] border border-[#9db4ab] bg-[#fbfff5] px-5 pr-14 text-lg leading-[1.5] text-[#12191d] shadow-[8px_7px_20px_0_rgba(0,0,0,0.12)] placeholder:text-[#6b716e] focus-visible:border-[#bbdb9b] focus-visible:ring-[3px] focus-visible:ring-[#bbdb9b]/25 sm:text-[20px]"
                                        />
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setShowConfirmPassword((current) => !current)
                                            }
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6b716e] transition hover:text-[#12191d]"
                                            aria-label={
                                                showConfirmPassword
                                                    ? "Hide confirm password"
                                                    : "Show confirm password"
                                            }
                                        >
                                            {showConfirmPassword ? (
                                                <EyeOff className="h-5 w-5" />
                                            ) : (
                                                <Eye className="h-5 w-5" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="h-[54px] w-full rounded-[12px] bg-[#e1ff9a] px-5 text-lg font-medium text-[#12191d] shadow-[8px_7px_20px_0_rgba(0,0,0,0.12)] hover:bg-[#d8f58f] disabled:cursor-not-allowed disabled:opacity-70 sm:text-[20px]"
                            >
                                {isSubmitting ? "Please wait..." : submitLabel}
                            </Button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
