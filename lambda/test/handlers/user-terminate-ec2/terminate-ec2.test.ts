import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { mockClient } from "aws-sdk-client-mock";
import { EC2Client, TerminateInstancesCommand } from "@aws-sdk/client-ec2";
import { handler } from "../../../src/handlers/user-terminate-ec2/terminate-ec2";

const ec2Mock = mockClient(EC2Client);

const baseEvent = {
    userId: "user-123",
    instanceId: "i-1234567890abcdef0",
    instanceArn: "arn:aws:ec2:us-west-2:123456789012:instance/i-1234567890abcdef0",
};

describe("terminate-ec2 handler", () => {
    beforeEach(() => {
        ec2Mock.reset();
    });

    afterEach(() => {
        ec2Mock.reset();
    });

    const mockSuccessfulTermination = () => {
        ec2Mock.on(TerminateInstancesCommand).resolves({
            TerminatingInstances: [
                {
                    InstanceId: "i-1234567890abcdef0",
                    PreviousState: { Name: "running" },
                    CurrentState: { Name: "shutting-down" },
                },
            ],
        });
    };

    it("successfully terminates EC2 instance and returns state transition", async () => {
        mockSuccessfulTermination();

        const result = await handler(baseEvent);

        expect(result.success).toBe(true);
        expect(result.instanceId).toBe("i-1234567890abcdef0");
        expect(result.previousState).toBe("running");
        expect(result.currentState).toBe("shutting-down");

        const terminateCalls = ec2Mock.commandCalls(TerminateInstancesCommand);
        expect(terminateCalls).toHaveLength(1);
        expect(terminateCalls[0].args[0].input.InstanceIds).toEqual(["i-1234567890abcdef0"]);
    });

    it("throws error when instanceId is missing", async () => {
        await expect(
            handler({ userId: "user-123", instanceArn: "arn:test" } as any),
        ).rejects.toThrow("Instance ID is required");
    });

    it("handles EC2 API errors gracefully", async () => {
        ec2Mock.on(TerminateInstancesCommand).rejects(new Error("EC2 API error"));

        await expect(handler(baseEvent)).rejects.toThrow("TerminationFailedError");
    });

    it("throws error when EC2 returns empty TerminatingInstances array", async () => {
        ec2Mock.on(TerminateInstancesCommand).resolves({
            TerminatingInstances: [],
        });

        await expect(handler(baseEvent)).rejects.toThrow("Failed to terminate EC2 instance");
    });

    it("throws error when EC2 response has no TerminatingInstances property", async () => {
        ec2Mock.on(TerminateInstancesCommand).resolves({});

        await expect(handler(baseEvent)).rejects.toThrow("Failed to terminate EC2 instance");
    });

    it("handles missing PreviousState in EC2 response", async () => {
        ec2Mock.on(TerminateInstancesCommand).resolves({
            TerminatingInstances: [
                {
                    InstanceId: "i-1234567890abcdef0",
                    CurrentState: { Name: "shutting-down" },
                    // No PreviousState
                },
            ],
        });

        const result = await handler(baseEvent);

        expect(result.success).toBe(true);
        expect(result.previousState).toBe("unknown");
        expect(result.currentState).toBe("shutting-down");
    });

    it("handles missing CurrentState in EC2 response", async () => {
        ec2Mock.on(TerminateInstancesCommand).resolves({
            TerminatingInstances: [
                {
                    InstanceId: "i-1234567890abcdef0",
                    PreviousState: { Name: "running" },
                    // No CurrentState
                },
            ],
        });

        const result = await handler(baseEvent);

        expect(result.success).toBe(true);
        expect(result.previousState).toBe("running");
        expect(result.currentState).toBe("shutting-down");
    });

    it("handles EC2 instance not found error", async () => {
        const notFoundError = new Error("InvalidInstanceID.NotFound");
        ec2Mock.on(TerminateInstancesCommand).rejects(notFoundError);

        await expect(handler(baseEvent)).rejects.toThrow("TerminationFailedError");
    });

    it("handles EC2 instance already terminated error", async () => {
        const alreadyTerminatedError = new Error("InvalidInstanceID.NotFound");
        ec2Mock.on(TerminateInstancesCommand).rejects(alreadyTerminatedError);

        await expect(handler(baseEvent)).rejects.toThrow("TerminationFailedError");
    });
});
