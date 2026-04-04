"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { useSession } from "next-auth/react";

interface UserContextType {
    userId: string | null;
    email: string | null;
    streamingLink: string | null;
    setStreamingLink: (link: string | null) => void;
    isAuthenticated: boolean;
    isLoading: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
    const { data: session, status } = useSession();
    const [streamingLink, setStreamingLink] = useState<string | null>(null);

    return (
        <UserContext.Provider
            value={{
                userId: session?.user?.id ?? null,
                email: session?.user?.email ?? null,
                streamingLink,
                setStreamingLink,
                isAuthenticated: status === "authenticated",
                isLoading: status === "loading",
            }}
        >
            {children}
        </UserContext.Provider>
    );
}

export function useUser() {
    const context = useContext(UserContext);
    if (!context) {
        throw new Error("useUser must be used within a UserProvider");
    }
    return context;
}
