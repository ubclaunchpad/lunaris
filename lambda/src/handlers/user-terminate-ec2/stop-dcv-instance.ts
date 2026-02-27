import DCVWrapper from "../../utils/dcvWrapper";

type stopDcvInstanceEvent = {
    userId: string;
    instanceId: string;
};

type stopDcvInstanceResult = {
    success: boolean;
};

export const handler = async (event: stopDcvInstanceEvent): Promise<stopDcvInstanceResult> => {
    try {
        if (!event.userId || !event.instanceId) {
            throw new Error("missing userId or instanceId in StopDCVInstanceHandler");
        }

        const dcvWrapper = new DCVWrapper(event.instanceId, event.userId);

        const result = await dcvWrapper.stopDCVSession();
        if (!result) {
            throw new Error("didn't return result")
        }

        return { success: result.stoppedSuccessfully };

    } catch (dcvError) {
        console.warn("Failed to stop DCV session:", dcvError);

        return { success: false };
    }
};
