import { describe, expect, it, jest } from "@jest/globals";

const sendMock = jest.fn();
jest.mock("@aws-sdk/client-ssm", () => ({
    SSMClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
    SendCommandCommand: jest.fn().mockImplementation((input) => ({ input, __type: "SendCommand" })),
    GetCommandInvocationCommand: jest
        .fn()
        .mockImplementation((input) => ({ input, __type: "GetCommandInvocation" })),
}));

const loadHandler = async () => {
    jest.resetModules();
    const mod = await import("../../../src/handlers/user-deploy-ec2/start-dcv-instance");
    return mod.handler;
};

describe("user-deploy-ec2/start-dcv-instance", () => {
    beforeEach(() => {
        sendMock.mockReset();
    });

    it("throws when instanceId is missing", async () => {
        const handler = await loadHandler();
        await expect(handler({ instanceId: "" } as any)).rejects.toThrow(
            "Missing required field: instanceId",
        );
    });

    it("returns success when command succeeds", async () => {
        const handler = await loadHandler();
        sendMock
            .mockResolvedValueOnce({ Command: { CommandId: "c1" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "started" });

        await expect(handler({ instanceId: "i-1" })).resolves.toEqual({
            success: true,
            message: "DCV service started successfully",
        });
    });

    it("returns failure payload for failed command status", async () => {
        const handler = await loadHandler();
        sendMock
            .mockResolvedValueOnce({ Command: { CommandId: "c1" } })
            .mockResolvedValueOnce({ Status: "Failed", StatusDetails: "failed-to-start" });

        await expect(handler({ instanceId: "i-1" })).resolves.toEqual({
            success: false,
            message: "failed-to-start",
        });
    });

    it("throws when send command has no command id", async () => {
        const handler = await loadHandler();
        sendMock.mockResolvedValueOnce({ Command: {} });

        await expect(handler({ instanceId: "i-1" })).rejects.toThrow("Failed to send SSM command");
    });

    it("retries after InvocationDoesNotExist", async () => {
        const handler = await loadHandler();
        sendMock
            .mockResolvedValueOnce({ Command: { CommandId: "c1" } })
            .mockRejectedValueOnce(
                Object.assign(new Error("not ready"), { name: "InvocationDoesNotExist" }),
            )
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" });

        await expect(handler({ instanceId: "i-1" })).resolves.toEqual({
            success: true,
            message: "DCV service started successfully",
        });
    });
});
