"use client";

import { Suspense, useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    ApiError,
    apiClient,
    type DeploymentStatus,
    type GetDeploymentStatusResponse,
} from "@/lib/api-client";
import { DCVViewerSimple } from "@/components/dcv-viewer-simple";
import { useDeploymentStatus } from "@/lib/hooks/useDeploymentStatus";
import {
    getTerminationRedirectPath,
    getTerminationStatusMessage,
    isTerminationComplete,
} from "@/lib/termination-flow";

interface StreamingPageState {
    serverUrl: string;
    username: string;
    password: string;
    instanceId: string;
    userId: string;
    gameId?: string;
    gameName?: string;
}

interface UploadStatus {
    filename: string;
    progress: "uploading" | "done" | "error";
    error?: string;
}

function StreamingPageFallback() {
    return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center">
            <div className="text-center">
                <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p>Loading streaming session...</p>
            </div>
        </div>
    );
}

function StreamingPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [state, setState] = useState<StreamingPageState | null>(null);
    const [showTopBar, setShowTopBar] = useState(false);
    const [isTerminating, setIsTerminating] = useState(false);
    const [terminationStatusText, setTerminationStatusText] = useState("");
    const [terminationError, setTerminationError] = useState<string | null>(null);
    const [sessionInfo, setSessionInfo] = useState<{ sessionId: string; authToken: string } | null>(
        null,
    );
    const [uploadStatuses, setUploadStatuses] = useState<UploadStatus[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
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

    const redirectAfterTermination = useCallback(async () => {
        if (state?.gameId) {
            window.sessionStorage.setItem("terminated-game-id", state.gameId);
        }

        if (document.fullscreenElement) {
            await document.exitFullscreen().catch(() => {});
        }

        router.replace(getTerminationRedirectPath(state?.gameId));
    }, [router, state?.gameId]);

    const handleTerminationStatusChange = useCallback(
        (status: DeploymentStatus, response: GetDeploymentStatusResponse) => {
            setTerminationStatusText(getTerminationStatusMessage(response));

            if (status !== "FAILED") {
                setTerminationError(null);
            }
        },
        [],
    );

    const handleTerminationSuccess = useCallback(
        async (response: GetDeploymentStatusResponse) => {
            setTerminationStatusText(getTerminationStatusMessage(response));

            if (!isTerminationComplete(response)) {
                setTerminationError(
                    "Received an unexpected completion state while ending the session.",
                );
                setIsTerminating(false);
                return;
            }

            await redirectAfterTermination();
        },
        [redirectAfterTermination],
    );

    const handleTerminationFailure = useCallback((error: Error) => {
        setTerminationError(error.message || "We couldn't finish ending your session.");
        setTerminationStatusText("We couldn't finish ending your session.");
        setIsTerminating(false);
    }, []);

    const { startPolling: startTerminationPolling, stopPolling: stopTerminationPolling } =
        useDeploymentStatus({
            userId: state?.userId ?? "",
            pollInterval: 3000,
            onStatusChange: handleTerminationStatusChange,
            onSuccess: handleTerminationSuccess,
            onError: handleTerminationFailure,
        });

    const handleFileUpload = useCallback(
        async (files: FileList) => {
            if (!state || !sessionInfo) return;

            for (const file of Array.from(files)) {
                setUploadStatuses((prev) => [
                    ...prev,
                    { filename: file.name, progress: "uploading" },
                ]);

                const formData = new FormData();
                formData.append("file", file);

                try {
                    const res = await fetch(
                        `${state.serverUrl}/nice-dcv/v1/api/session/${sessionInfo.sessionId}/file-transfer/upload`,
                        {
                            method: "POST",
                            headers: { "X-Authorization": `Token ${sessionInfo.authToken}` },
                            body: formData,
                        },
                    );

                    if (!res.ok) throw new Error(`HTTP ${res.status}`);

                    setUploadStatuses((prev) =>
                        prev.map((s) =>
                            s.filename === file.name ? { ...s, progress: "done" } : s,
                        ),
                    );
                } catch (err) {
                    setUploadStatuses((prev) =>
                        prev.map((s) =>
                            s.filename === file.name
                                ? { ...s, progress: "error", error: String(err) }
                                : s,
                        ),
                    );
                }

                // Clear completed/failed after 3s
                setTimeout(() => {
                    setUploadStatuses((prev) => prev.filter((s) => s.filename !== file.name));
                }, 3000);
            }
        },
        [state, sessionInfo],
    );

    const handleTerminate = async () => {
        if (!state || isTerminating) return;

        setIsTerminating(true);
        setTerminationError(null);
        setTerminationStatusText("Ending your session...");
        setShowTopBar(false);
        setSessionInfo(null);
        setUploadStatuses([]);

        try {
            await apiClient.terminateInstance({
                userId: state.userId,
                instanceId: state.instanceId || undefined,
            });
            startTerminationPolling();
            return;
        } catch (error) {
            if (error instanceof ApiError && error.statusCode === 409) {
                setTerminationStatusText("Termination is already in progress...");
                startTerminationPolling();
                return;
            }

            stopTerminationPolling();
            setTerminationError(
                error instanceof Error ? error.message : "We couldn't start ending your session.",
            );
            setTerminationStatusText("We couldn't start ending your session.");
            setIsTerminating(false);
        }
    };

    if (!state) {
        return <StreamingPageFallback />;
    }

    if (isTerminating) {
        return (
            <div
                ref={containerRef}
                className="w-screen h-screen bg-black text-white flex items-center justify-center px-6"
            >
                <div className="max-w-xl w-full rounded-2xl border border-white/10 bg-white/5 px-8 py-10 text-center">
                    <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-4 border-[#e1ff9a] border-t-transparent" />
                    <p className="font-space-grotesk text-sm uppercase tracking-[0.3em] text-white/60">
                        Ending Session
                    </p>
                    <h1 className="mt-3 font-space-grotesk text-3xl font-bold text-white">
                        {state.gameName ? `Closing ${state.gameName}` : "Closing your stream"}
                    </h1>
                    <p className="mt-4 font-space-grotesk text-base text-white/80">
                        {terminationStatusText || "Ending your session..."}
                    </p>
                    <p className="mt-3 text-sm text-white/50">
                        We&apos;ll take you back automatically as soon as the backend confirms the
                        instance is no longer active.
                    </p>
                    {terminationError && (
                        <div className="mt-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                            {terminationError}
                        </div>
                    )}
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
                <div className="bg-gray-900/95 backdrop-blur-sm text-white px-4 py-3 flex items-center justify-between gap-4">
                    <span className="font-space-grotesk font-medium text-sm">
                        {state.gameName || "Game"}
                    </span>
                    <div className="flex items-center gap-2">
                        {/* Upload status pills */}
                        {uploadStatuses.map((s) => (
                            <span
                                key={s.filename}
                                className={`text-xs px-2 py-1 rounded ${
                                    s.progress === "uploading"
                                        ? "bg-blue-600"
                                        : s.progress === "done"
                                          ? "bg-green-600"
                                          : "bg-red-600"
                                }`}
                            >
                                {s.progress === "uploading" && "↑ "}
                                {s.progress === "done" && "✓ "}
                                {s.progress === "error" && "✗ "}
                                {s.filename}
                            </span>
                        ))}
                        {/* File upload button */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={!sessionInfo}
                            title={
                                !sessionInfo ? "Waiting for session..." : "Upload files to instance"
                            }
                            className="px-4 py-1.5 bg-gray-600 rounded text-sm font-medium hover:bg-gray-500 transition-colors disabled:opacity-40"
                        >
                            Upload Files
                        </button>
                        <button
                            onClick={handleTerminate}
                            disabled={isTerminating}
                            className="px-4 py-1.5 bg-red-600 rounded text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                            {isTerminating ? "Terminating..." : "Terminate"}
                        </button>
                    </div>
                </div>
            </div>

            {terminationError && (
                <div className="absolute bottom-6 right-6 z-[60] rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-sm text-red-100 shadow-lg">
                    {terminationError}
                </div>
            )}

            {/* DCV viewer fills entire screen */}
            <div className="absolute inset-0">
                <DCVViewerSimple
                    serverUrl={state.serverUrl}
                    username={state.username}
                    password={state.password}
                    onConnect={() => {}}
                    onDisconnect={() => {}}
                    onError={() => {}}
                    onSessionReady={setSessionInfo}
                />
            </div>
        </div>
    );
}

export default function StreamingPage() {
    return (
        <Suspense fallback={<StreamingPageFallback />}>
            <StreamingPageContent />
        </Suspense>
    );
}
