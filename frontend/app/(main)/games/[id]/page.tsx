"use client";

import { use, useState, useCallback, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ChevronLeft, Gamepad2, Keyboard } from "lucide-react";
import gamesData from "@/lib/data.json";
import {
    apiClient,
    type Game,
    type GetDeploymentStatusResponse,
    type DeploymentStatus,
} from "@/lib/api-client";
import { useDeploymentStatus } from "@/lib/hooks/useDeploymentStatus";

interface GamePageProps {
    params: Promise<{
        id: string;
    }>;
}

interface StreamingCredentials {
    serverUrl: string;
    username: string;
    password: string;
    instanceId?: string;
}

function toGame(g: (typeof gamesData.games)[number]): Game {
    return {
        gameId: g.id,
        name: g.name,
        description: g.description || "",
        imageUrl: g.image,
        tags: g.tags,
        modes: g.modes,
        ebsSnapshotId: "",
        minInstanceType: "",
        playable: g.playable,
    };
}

export default function GamePage({ params }: GamePageProps) {
    const router = useRouter();
    const { id } = use(params);
    const { data: session } = useSession();

    const fallback = gamesData.games.find((g) => g.id === id);
    const [game, setGame] = useState<Game | null>(fallback ? toGame(fallback) : null);

    useEffect(() => {
        apiClient
            .getGame(id)
            .then((res) => setGame(res.data))
            .catch(() => {}); // keep fallback on error
    }, [id]);

    const userId = session?.user?.id ?? "test123";

    useEffect(() => {
        apiClient.setToken(session?.idToken ?? null);
    }, [session?.idToken]);
    const [isDeploying, setIsDeploying] = useState(false);
    const [deploymentStatus, setDeploymentStatus] = useState<string>("");
    const [deploymentError, setDeploymentError] = useState<string | null>(null);
    const [lastLoggedStep, setLastLoggedStep] = useState<string | null>(null);
    const [credentials, setCredentials] = useState<StreamingCredentials | null>(null);
    const [sessionNotice, setSessionNotice] = useState<string | null>(null);
    const [isFetchingCredentials, setIsFetchingCredentials] = useState(false);
    const [isCheckingExisting, setIsCheckingExisting] = useState(true);
    const deployStartedAtRef = useRef<string | null>(null);

    useEffect(() => {
        const terminatedGameId = window.sessionStorage.getItem("terminated-game-id");

        if (terminatedGameId === id) {
            setSessionNotice(
                "Session ended. You can launch this game again whenever you're ready.",
            );
            window.sessionStorage.removeItem("terminated-game-id");
            return;
        }

        setSessionNotice(null);
    }, [id]);

    // Check for existing streaming session on mount
    useEffect(() => {
        const checkExistingStream = async () => {
            setCredentials(null);

            try {
                const streamData = await apiClient.getStreamingLink({ userId });
                const session = streamData as {
                    streamingLink?: string;
                    dcvUser?: string;
                    dcvPassword?: string;
                    instanceId?: string;
                };

                if (session.streamingLink && session.dcvUser && session.dcvPassword) {
                    setCredentials({
                        serverUrl: session.streamingLink,
                        username: session.dcvUser,
                        password: session.dcvPassword,
                        instanceId: session.instanceId,
                    });
                }
            } catch {
                // No existing stream
            } finally {
                setIsCheckingExisting(false);
            }
        };

        checkExistingStream();
    }, [userId]);

    // Handle deployment status changes
    const handleStatusChange = useCallback(
        (status: DeploymentStatus, response: GetDeploymentStatusResponse) => {
            if (status === "RUNNING") {
                const stepKey = `${response.currentStep}-${response.stepNumber}`;
                if (stepKey !== lastLoggedStep) {
                    const stepInfo =
                        response.stepNumber && response.totalSteps
                            ? `Step ${response.stepNumber}/${response.totalSteps}`
                            : "";
                    const statusText = response.currentStepName || response.message;
                    setDeploymentStatus(`${stepInfo} ${statusText}`.trim());
                    setLastLoggedStep(stepKey);
                }
            } else if (status === "NOT_FOUND") {
                if (lastLoggedStep !== "NOT_FOUND") {
                    setDeploymentStatus("Initializing deployment...");
                    setLastLoggedStep("NOT_FOUND");
                }
            } else if (status === "FAILED") {
                const errorInfo = response.errorStep
                    ? ` at step "${response.failedAt || response.errorStep}"`
                    : "";
                setDeploymentStatus(`Deployment failed${errorInfo}: ${response.message}`);
            }
        },
        [lastLoggedStep],
    );

    // Handle deployment success - auto-fetch streaming credentials
    const handleDeploymentSuccess = useCallback(
        async (response: GetDeploymentStatusResponse) => {
            // Ignore stale SUCCEEDED from a previous deployment
            if (deployStartedAtRef.current && response.startedAt) {
                if (new Date(response.startedAt) < new Date(deployStartedAtRef.current)) {
                    return;
                }
            }

            setDeploymentStatus("Instance ready! Getting credentials...");
            setIsFetchingCredentials(true);

            try {
                let retries = 0;
                const maxRetries = 30;

                while (retries < maxRetries) {
                    try {
                        const streamData = await apiClient.getStreamingLink({ userId });
                        const session = streamData as {
                            streamingLink?: string;
                            dcvUser?: string;
                            dcvPassword?: string;
                            instanceId?: string;
                        };

                        if (session.streamingLink && session.dcvUser && session.dcvPassword) {
                            setCredentials({
                                serverUrl: session.streamingLink,
                                username: session.dcvUser,
                                password: session.dcvPassword,
                                instanceId: session.instanceId || response.instanceId,
                            });
                            setDeploymentStatus("Ready to stream!");
                            setIsDeploying(false);
                            setIsFetchingCredentials(false);
                            return;
                        }
                    } catch {
                        // Credentials not ready yet
                    }

                    retries++;
                    setDeploymentStatus(`Getting credentials... (${retries}/${maxRetries})`);
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                }

                setDeploymentStatus("Failed to get credentials. Please try again.");
                setIsDeploying(false);
                setIsFetchingCredentials(false);
            } catch (error) {
                setDeploymentStatus(
                    `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                );
                setIsDeploying(false);
                setIsFetchingCredentials(false);
            }
        },
        [userId],
    );

    // Handle deployment error
    const handleDeploymentError = useCallback((error: Error) => {
        setDeploymentStatus(`Deployment failed: ${error.message}`);
        setIsDeploying(false);
    }, []);

    // Set up deployment status polling
    const { startPolling } = useDeploymentStatus({
        userId,
        pollInterval: 5000,
        onStatusChange: handleStatusChange,
        onSuccess: handleDeploymentSuccess,
        onError: handleDeploymentError,
    });

    // Handle Play button click
    const handlePlayClick = async () => {
        if (!game?.playable) return;

        setIsDeploying(true);
        setDeploymentStatus("Starting deployment...");
        setDeploymentError(null);
        setLastLoggedStep(null);
        setCredentials(null);
        deployStartedAtRef.current = new Date().toISOString();

        try {
            const response = await apiClient.deployInstance({ userId, gameId: id });
            setDeploymentStatus(`Deployment started: ${response.message}`);
            startPolling();
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            setDeploymentError(`Deploy error: ${message}`);
            setIsDeploying(false);
        }
    };

    const handleStartStreaming = () => {
        if (!credentials) return;

        const params = new URLSearchParams({
            serverUrl: credentials.serverUrl,
            username: credentials.username,
            password: credentials.password,
            instanceId: credentials.instanceId || "",
            userId,
            gameId: id,
            gameName: game?.name || "",
        });

        router.push(`/streaming?${params.toString()}`);
    };

    if (!game) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-white text-2xl">Game not found</div>
            </div>
        );
    }

    return (
        <div>
            <button
                onClick={() => router.back()}
                className="flex items-center gap-2 mb-4 text-white hover:text-[#e1ff9a] transition-colors"
            >
                <ChevronLeft className="w-6 h-6" />
                <span className="font-space-grotesk text-xl">Back</span>
            </button>

            {/* Game Header Section */}
            <div className="flex gap-8 mb-5">
                {/* Game Cover Image */}
                <div className="w-[365px] h-[240px] rounded-[10px] overflow-hidden shadow-[8px_7px_20px_0px_rgba(0,0,0,0.12)] shrink-0 relative">
                    <Image src={game.imageUrl} alt={game.name} fill className="object-cover" />
                </div>

                {/* Game Info */}
                <div className="flex-1 pt-2">
                    <h1 className="font-space-grotesk font-bold text-white text-[36px] leading-[1.24] mb-4">
                        {game.name}
                    </h1>

                    <p className="font-space-grotesk text-[#fbfff5] text-[14px] leading-[1.5] mb-4">
                        {game.description || "No description available."}
                    </p>

                    {/* Tags */}
                    <div className="flex gap-4 flex-wrap">
                        {game.tags.map((tag, idx) => (
                            <div
                                key={idx}
                                className="border border-[#e6daf6] text-[#e6daf6] px-4 py-2 rounded-sm font-space-grotesk text-base shadow-[8px_7px_20px_0px_rgba(0,0,0,0.12)]"
                            >
                                {tag}
                            </div>
                        ))}
                        {(game.modes ?? []).map((mode, idx) => (
                            <div
                                key={idx}
                                className="border border-[#e6daf6] text-[#e6daf6] px-4 py-2 rounded-lg font-space-grotesk text-base shadow-[8px_7px_20px_0px_rgba(0,0,0,0.12)]"
                            >
                                {mode}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Play / Stream Button */}
            <div className="mb-5">
                {credentials ? (
                    <button
                        onClick={handleStartStreaming}
                        className="border border-[#e6daf6] font-space-grotesk font-medium text-xl px-5 py-3 rounded-xl shadow-[8px_7px_20px_0px_rgba(0,0,0,0.12)] transition-colors bg-[#e1ff9a] text-[#12191d] hover:bg-[#d1ef8a] cursor-pointer"
                    >
                        Start Streaming
                    </button>
                ) : (
                    <button
                        onClick={handlePlayClick}
                        disabled={
                            !game.playable ||
                            isDeploying ||
                            isFetchingCredentials ||
                            isCheckingExisting
                        }
                        className={`border border-[#e6daf6] font-space-grotesk font-medium text-xl px-5 py-3 rounded-xl shadow-[8px_7px_20px_0px_rgba(0,0,0,0.12)] transition-colors ${
                            game.playable &&
                            !isDeploying &&
                            !isFetchingCredentials &&
                            !isCheckingExisting
                                ? "bg-[#e1ff9a] text-[#12191d] hover:bg-[#d1ef8a] cursor-pointer"
                                : "bg-gray-500 text-gray-300 cursor-not-allowed opacity-50"
                        }`}
                    >
                        {isFetchingCredentials ? (
                            <span className="flex items-center gap-2">
                                <div className="animate-spin h-5 w-5 border-2 border-gray-300 border-t-transparent rounded-full"></div>
                                Getting credentials...
                            </span>
                        ) : isDeploying ? (
                            <span className="flex items-center gap-2">
                                <div className="animate-spin h-5 w-5 border-2 border-gray-300 border-t-transparent rounded-full"></div>
                                Deploying...
                            </span>
                        ) : game.playable ? (
                            "Play"
                        ) : (
                            "Not Available"
                        )}
                    </button>
                )}

                {/* Deployment Error */}
                {deploymentError && (
                    <div className="mt-4 bg-red-900/50 border border-red-700 rounded-lg p-4">
                        <span className="text-red-300 text-sm">{deploymentError}</span>
                    </div>
                )}

                {sessionNotice && (
                    <div className="mt-4 rounded-lg border border-white/15 bg-white/5 p-4">
                        <span className="text-sm text-[#fbfff5]">{sessionNotice}</span>
                    </div>
                )}

                {/* Deployment Status */}
                {(isDeploying || isFetchingCredentials) && deploymentStatus && (
                    <div className="mt-4 bg-blue-900/50 border border-blue-700 rounded-lg p-4">
                        <div className="flex items-center gap-2">
                            <div className="animate-spin h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                            <span className="text-blue-300 text-sm">{deploymentStatus}</span>
                        </div>
                        <p className="text-xs text-blue-400 mt-2">
                            This may take 2-3 minutes. The button will change to &quot;Start
                            Streaming&quot; when ready.
                        </p>
                    </div>
                )}

                {/* Ready indicator */}
                {credentials && (
                    <div className="mt-4 bg-green-900/50 border border-green-700 rounded-lg p-4">
                        <div className="flex items-center gap-2">
                            <span className="text-green-400">&#10003;</span>
                            <span className="text-green-300 text-sm">
                                Instance ready! Click &quot;Start Streaming&quot; to launch
                                fullscreen.
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Game Details */}
            <div className="grid grid-cols-2 gap-16">
                <div className="font-space-grotesk text-[#fbfff5] text-base space-y-2">
                    <p>
                        <span className="font-bold">Publisher:</span> Electronic Arts
                    </p>
                    <p>
                        <span className="font-bold">Developer:</span> Hazelight Studios
                    </p>
                    <p>
                        <span className="font-bold">Rating:</span> T
                    </p>
                    <p>
                        <span className="font-bold">Release Date:</span> March 25, 2021
                    </p>
                </div>
                <div className="font-space-grotesk text-[#fbfff5] text-base space-y-2">
                    <p>
                        <span className="font-bold">Warnings:</span> Blood, Mild Language
                    </p>
                    <p>
                        <span className="font-bold">Languages:</span> English, French
                    </p>
                    <p className="font-bold">Minimum System Requirements:</p>
                    <p className="flex items-center gap-2">
                        <span className="font-bold">Input:</span>
                        <Gamepad2 className="w-5 h-5 text-[#e6daf6]" />
                        <Keyboard className="w-5 h-5 text-[#e6daf6]" />
                    </p>
                </div>
            </div>
        </div>
    );
}
