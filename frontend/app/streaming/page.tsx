"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { DCVViewerSimple } from "@/components/dcv-viewer-simple";

interface StreamingPageState {
    serverUrl: string;
    username: string;
    password: string;
    instanceId: string;
    userId: string;
    gameId?: string;
    gameName?: string;
}

export default function StreamingPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [state, setState] = useState<StreamingPageState | null>(null);
    const [showTopBar, setShowTopBar] = useState(false);
    const [isTerminating, setIsTerminating] = useState(false);
    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const serverUrl = searchParams.get("serverUrl");
        const username = searchParams.get("username");
        const password = searchParams.get("password");
        const instanceId = searchParams.get("instanceId") || "";
        const userId = searchParams.get("userId") || "";
        const gameId = searchParams.get("gameId") || undefined;
        const gameName = searchParams.get("gameName") || undefined;

        if (!serverUrl || !username || !password) {
            setTimeout(() => router.push("/browse"), 2000);
            return;
        }

        setState({ serverUrl, username, password, instanceId, userId, gameId, gameName });

        // Request fullscreen
        setTimeout(() => {
            containerRef.current?.requestFullscreen?.().catch(() => {});
        }, 200);
    }, [searchParams, router]);

    // Exit fullscreen when leaving the page
    useEffect(() => {
        return () => {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
            }
        };
    }, []);

    const handleMouseEnterTop = useCallback(() => {
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }
        setShowTopBar(true);
    }, []);

    const handleMouseLeaveTop = useCallback(() => {
        hideTimeoutRef.current = setTimeout(() => {
            setShowTopBar(false);
        }, 500);
    }, []);

    const handleTerminate = async () => {
        if (!state || isTerminating) return;

        setIsTerminating(true);
        try {
            if (state.instanceId && state.userId) {
                await apiClient.terminateInstance({
                    userId: state.userId,
                    instanceId: state.instanceId,
                });
            }
        } catch {
            // Best effort
        }

        if (document.fullscreenElement) {
            await document.exitFullscreen().catch(() => {});
        }
        router.push(state.gameId ? `/games/${state.gameId}` : "/browse");
    };

    if (!state) {
        return (
            <div className="min-h-screen bg-black text-white flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p>Loading streaming session...</p>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="w-screen h-screen bg-black relative">
            {/* Invisible hover zone at top of screen */}
            <div
                className="absolute top-0 left-0 right-0 h-4 z-[60]"
                onMouseEnter={handleMouseEnterTop}
            />

            {/* Dropdown bar - slides down on hover */}
            <div
                className={`absolute top-0 left-0 right-0 z-[60] transition-transform duration-200 ${
                    showTopBar ? "translate-y-0" : "-translate-y-full"
                }`}
                onMouseEnter={handleMouseEnterTop}
                onMouseLeave={handleMouseLeaveTop}
            >
                <div className="bg-gray-900/95 backdrop-blur-sm text-white px-4 py-3 flex items-center justify-between">
                    <span className="font-space-grotesk font-medium text-sm">
                        {state.gameName || "Game"}
                    </span>
                    <button
                        onClick={handleTerminate}
                        disabled={isTerminating}
                        className="px-4 py-1.5 bg-red-600 rounded text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                        {isTerminating ? "Terminating..." : "Terminate"}
                    </button>
                </div>
            </div>

            {/* DCV viewer fills entire screen */}
            <div className="absolute inset-0">
                <DCVViewerSimple
                    serverUrl={state.serverUrl}
                    username={state.username}
                    password={state.password}
                    onConnect={() => {}}
                    onDisconnect={() => {}}
                    onError={() => {}}
                />
            </div>
        </div>
    );
}
