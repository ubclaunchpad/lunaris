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
    const mod = await import("../../../src/handlers/user-deploy-ec2/configure-dcv-instance");
    return mod.handler;
};

describe("user-deploy-ec2/configure-dcv-instance", () => {
    beforeEach(() => {
        sendMock.mockReset();
    });

    it("throws when required fields are missing", async () => {
        const handler = await loadHandler();
        await expect(
            handler({ instanceId: "", dcvIp: "", dcvPassword: "" } as any),
        ).rejects.toThrow("Missing required fields: instanceId, dcvIp, dcvPassword");
    });

    it("returns success when all command phases succeed", async () => {
        const handler = await loadHandler();

        sendMock
            .mockResolvedValueOnce({ Command: { CommandId: "c1" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c2" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c3" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c4" } })
            .mockResolvedValueOnce({
                Status: "Success",
                StandardOutputContent: "Certificate created successfully",
            })
            .mockResolvedValueOnce({ Command: { CommandId: "c5" } })
            .mockResolvedValueOnce({
                Status: "Success",
                StandardOutputContent: "SSL configured and DCV restarted",
            });

        const result = await handler({
            instanceId: "i-1",
            dcvIp: "1.2.3.4",
            dcvPassword: "pw",
        });

        expect(result.success).toBe(true);
        expect(result.passwordSet).toBe(true);
        expect(result.sslConfigured).toBe(true);
    });

    it("returns partial failure when certificate is not created", async () => {
        const handler = await loadHandler();

        sendMock
            .mockResolvedValueOnce({ Command: { CommandId: "c1" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c2" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c3" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c4" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "no cert output" });

        const result = await handler({
            instanceId: "i-1",
            dcvIp: "1.2.3.4",
            dcvPassword: "pw",
        });

        expect(result.success).toBe(false);
        expect(result.passwordSet).toBe(true);
        expect(result.sslConfigured).toBe(false);
    });

    it("handles failed status from command polling", async () => {
        const handler = await loadHandler();

        sendMock
            .mockResolvedValueOnce({ Command: { CommandId: "c1" } })
            .mockResolvedValueOnce({ Status: "Failed", StatusDetails: "failed" })
            .mockResolvedValueOnce({ Command: { CommandId: "c2" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c3" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c4" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "no cert output" });

        const result = await handler({
            instanceId: "i-1",
            dcvIp: "1.2.3.4",
            dcvPassword: "pw",
        });

        expect(result.passwordSet).toBe(false);
        expect(result.success).toBe(false);
    });

    it("retries on InvocationDoesNotExist then succeeds", async () => {
        const handler = await loadHandler();

        sendMock
            .mockResolvedValueOnce({ Command: { CommandId: "c1" } })
            .mockRejectedValueOnce(
                Object.assign(new Error("not yet"), { name: "InvocationDoesNotExist" }),
            )
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c2" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c3" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c4" } })
            .mockResolvedValueOnce({
                Status: "Success",
                StandardOutputContent: "Certificate created successfully",
            })
            .mockResolvedValueOnce({ Command: { CommandId: "c5" } })
            .mockResolvedValueOnce({
                Status: "Success",
                StandardOutputContent: "SSL configured and DCV restarted",
            });

        const result = await handler({
            instanceId: "i-1",
            dcvIp: "1.2.3.4",
            dcvPassword: "pw",
        });

        expect(result.success).toBe(true);
    });
});
