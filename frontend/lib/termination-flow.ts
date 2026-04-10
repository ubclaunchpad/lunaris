import type { GetDeploymentStatusResponse } from "./api-client";

export function isTerminationComplete(response: GetDeploymentStatusResponse): boolean {
    return response.status === "SUCCEEDED" && response.deploymentStatus === "terminated";
}

export function getTerminationStatusMessage(response: GetDeploymentStatusResponse | null): string {
    if (!response) {
        return "Ending your session...";
    }

    if (response.status === "RUNNING") {
        return response.currentStepName || response.message || "Ending your session...";
    }

    if (response.status === "FAILED") {
        return response.message || "We couldn't finish ending your session.";
    }

    if (isTerminationComplete(response)) {
        return response.message || "Instance has been terminated";
    }

    return response.message || "Ending your session...";
}

export function getTerminationRedirectPath(gameId?: string): string {
    return gameId ? `/games/${gameId}` : "/browse";
}
