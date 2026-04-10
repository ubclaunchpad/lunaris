import { describe, expect, it, jest } from "@jest/globals";

const mockGetInstanceDetails = jest.fn();
jest.mock("../../../src/utils/ec2Wrapper", () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
        getInstanceDetails: mockGetInstanceDetails,
    })),
}));

const requestMock = jest.fn();
jest.mock("https", () => ({
    __esModule: true,
    default: {
        request: (...args: unknown[]) => requestMock(...args),
    },
}));

const loadHandler = async () => {
    jest.resetModules();
    const mod = await import("../../../src/handlers/user-deploy-ec2/verify-dcv-endpoint");
    return mod.handler;
};

describe("user-deploy-ec2/verify-dcv-endpoint", () => {
    beforeEach(() => {
        mockGetInstanceDetails.mockReset();
        requestMock.mockReset();
    });

    it("throws when instanceId is missing", async () => {
        const handler = await loadHandler();
        await expect(handler({ instanceId: "" } as any)).rejects.toThrow(
            "Missing required field: instanceId",
        );
    });

    it("returns success when trusted HTTPS is reachable", async () => {
        const handler = await loadHandler();
        mockGetInstanceDetails.mockResolvedValue({
            instanceId: "i-1",
            state: "running",
            publicIp: "1.2.3.4",
            volumes: [],
        });

        requestMock.mockImplementation((options: any, callback: (response: any) => void) => {
            expect(options.hostname).toBe("1.2.3.4");
            expect(options.port).toBe(8443);
            callback({
                statusCode: 200,
                resume: jest.fn(),
            });

            return {
                on: jest.fn().mockReturnThis(),
                end: jest.fn(),
                destroy: jest.fn(),
            };
        });

        const result = await handler({
            instanceId: "i-1",
            dcvPort: 8443,
            timeoutSeconds: 5,
            pollIntervalSeconds: 0,
        });

        expect(result).toMatchObject({
            success: true,
            dcvIp: "1.2.3.4",
            dcvPort: 8443,
            streamingLink: "https://1-2-3-4.nip.io:8443",
        });
    });

    it("fails immediately when the instance is terminated", async () => {
        const handler = await loadHandler();
        mockGetInstanceDetails.mockResolvedValue({
            instanceId: "i-1",
            state: "terminated",
            publicIp: "1.2.3.4",
            volumes: [],
        });

        await expect(
            handler({
                instanceId: "i-1",
                timeoutSeconds: 5,
                pollIntervalSeconds: 0,
            }),
        ).rejects.toThrow("DCV instance entered unexpected state: terminated");
    });

    it("times out when HTTPS never becomes ready", async () => {
        const handler = await loadHandler();
        const nowValues = [0, 0, 2000];
        const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => nowValues.shift() ?? 2000);
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

        mockGetInstanceDetails.mockResolvedValue({
            instanceId: "i-1",
            state: "running",
            publicIp: "1.2.3.4",
            volumes: [],
        });
        requestMock.mockImplementation(() => {
            let errorHandler: ((error: Error) => void) | undefined;
            const request = {
                on: jest.fn((event: string, cb: (error: Error) => void) => {
                    if (event === "error") {
                        errorHandler = cb;
                    }
                    return request;
                }),
                end: jest.fn(() => errorHandler?.(new Error("self signed certificate"))),
                destroy: jest.fn(),
            };

            return request;
        });

        await expect(
            handler({
                instanceId: "i-1",
                timeoutSeconds: 1,
                pollIntervalSeconds: 0,
            }),
        ).rejects.toThrow("DCV endpoint did not become ready");

        nowSpy.mockRestore();
        warnSpy.mockRestore();
    });
});
