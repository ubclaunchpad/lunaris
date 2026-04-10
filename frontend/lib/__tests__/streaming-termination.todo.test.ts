import { describe, expect, it } from "vitest";
import {
    getTerminationRedirectPath,
    getTerminationStatusMessage,
    isTerminationComplete,
} from "../termination-flow";

describe("streaming termination flow", () => {
    it("maps running terminate status to an in-progress message", () => {
        expect(
            getTerminationStatusMessage({
                status: "RUNNING",
                deploymentStatus: "terminating",
                message: "Termination in progress...",
                currentStepName: "Stopping EC2 instance",
            }),
        ).toBe("Stopping EC2 instance");
    });

    it("treats a terminated workflow result as complete", () => {
        const response = {
            status: "SUCCEEDED" as const,
            deploymentStatus: "terminated" as const,
            message: "Instance has been terminated",
        };

        expect(isTerminationComplete(response)).toBe(true);
        expect(getTerminationStatusMessage(response)).toBe("Instance has been terminated");
    });

    it("builds the correct redirect target after termination", () => {
        expect(getTerminationRedirectPath("fortnite")).toBe("/games/fortnite");
        expect(getTerminationRedirectPath()).toBe("/browse");
    });
});
