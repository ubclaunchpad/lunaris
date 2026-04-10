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
    const originalRetryDelay = process.env.SSM_SEND_RETRY_DELAY_MS;
    const originalRetryTimeout = process.env.SSM_SEND_RETRY_TIMEOUT_MS;

    beforeEach(() => {
        sendMock.mockReset();
        process.env.SSM_SEND_RETRY_DELAY_MS = "0";
        process.env.SSM_SEND_RETRY_TIMEOUT_MS = "100";
    });

    afterAll(() => {
        if (originalRetryDelay === undefined) {
            delete process.env.SSM_SEND_RETRY_DELAY_MS;
        } else {
            process.env.SSM_SEND_RETRY_DELAY_MS = originalRetryDelay;
        }

        if (originalRetryTimeout === undefined) {
            delete process.env.SSM_SEND_RETRY_TIMEOUT_MS;
        } else {
            process.env.SSM_SEND_RETRY_TIMEOUT_MS = originalRetryTimeout;
        }
    });

    const queueSuccessfulConfigureFlow = () => {
        sendMock
            .mockResolvedValueOnce({ Command: { CommandId: "c1" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c2" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c3" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c4" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "win-acme ready" })
            .mockResolvedValueOnce({ Command: { CommandId: "c5" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "certificate ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c6" } })
            .mockResolvedValueOnce({
                Status: "Success",
                StandardOutputContent: "SSL configured and DCV restarted",
            });
    };

    it("throws when required fields are missing", async () => {
        const handler = await loadHandler();
        await expect(
            handler({ instanceId: "", dcvIp: "", dcvPassword: "" } as any),
        ).rejects.toThrow("Missing required fields: instanceId, dcvIp, dcvPassword");
    });

    it("returns success when all command phases succeed", async () => {
        const handler = await loadHandler();
        queueSuccessfulConfigureFlow();

        const result = await handler({
            instanceId: "i-1",
            dcvIp: "1.2.3.4",
            dcvPassword: "pw",
        });

        expect(result.success).toBe(true);
        expect(result.passwordSet).toBe(true);
        expect(result.sslConfigured).toBe(true);

        const firewallCommand = sendMock.mock.calls[2][0];
        expect(firewallCommand.input.Parameters.commands).toEqual(
            expect.arrayContaining([
                expect.stringContaining('New-NetFirewallRule -DisplayName "Lunaris DCV HTTPS"'),
            ]),
        );

        const certCommand = sendMock.mock.calls[8][0];
        expect(certCommand.input.Parameters.commands).toEqual(
            expect.arrayContaining([expect.stringContaining("--installation none")]),
        );

        const installCommand = sendMock.mock.calls[10][0];
        expect(installCommand.input.Parameters.commands).toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'Get-ChildItem -Path "C:\\DCV-Certs" -Recurse -File -Filter "*-chain.pem"',
                ),
                expect.stringContaining(
                    'Restart-Service -Name "dcvserver" -Force -ErrorAction Stop',
                ),
            ]),
        );
    });

    it("throws when DCV SSL installation fails", async () => {
        const handler = await loadHandler();

        sendMock
            .mockResolvedValueOnce({ Command: { CommandId: "c1" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c2" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c3" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c4" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "win-acme ready" })
            .mockResolvedValueOnce({ Command: { CommandId: "c5" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "certificate ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c6" } })
            .mockResolvedValueOnce({ Status: "Failed", StatusDetails: "Port 8443 not listening" });

        await expect(
            handler({
                instanceId: "i-1",
                dcvIp: "1.2.3.4",
                dcvPassword: "pw",
            }),
        ).rejects.toThrow("Failed to install SSL certificate into DCV: Port 8443 not listening");
    });

    it("throws when password setup fails", async () => {
        const handler = await loadHandler();

        sendMock
            .mockResolvedValueOnce({ Command: { CommandId: "c1" } })
            .mockResolvedValueOnce({ Status: "Failed", StatusDetails: "failed" });

        await expect(
            handler({
                instanceId: "i-1",
                dcvIp: "1.2.3.4",
                dcvPassword: "pw",
            }),
        ).rejects.toThrow("Failed to set password: failed");
    });

    it("retries SendCommand until the instance is SSM-manageable", async () => {
        const handler = await loadHandler();

        sendMock
            .mockRejectedValueOnce(
                Object.assign(new Error("Instances not in a valid state for account"), {
                    name: "InvalidInstanceId",
                }),
            )
            .mockResolvedValueOnce({ Command: { CommandId: "c1" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c2" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c3" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c4" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "win-acme ready" })
            .mockResolvedValueOnce({ Command: { CommandId: "c5" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "certificate ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c6" } })
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
        expect(sendMock.mock.calls[0][0].__type).toBe("SendCommand");
        expect(sendMock.mock.calls[1][0].__type).toBe("SendCommand");
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
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "win-acme ready" })
            .mockResolvedValueOnce({ Command: { CommandId: "c5" } })
            .mockResolvedValueOnce({ Status: "Success", StandardOutputContent: "certificate ok" })
            .mockResolvedValueOnce({ Command: { CommandId: "c6" } })
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
