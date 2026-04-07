export async function signup(email: string, password: string) {
    const res = await fetch("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password }),
    });

    return res.json();
}
