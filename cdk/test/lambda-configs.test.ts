import updateRunningStreamsDeployConfig from "../lambdas/update-running-streams-deploy.config";

describe("Lambda config regressions", () => {
    test.failing(
        "deploy-side update-running-streams Lambda receives RUNNING_INSTANCES_TABLE_NAME when placeholder migration is enabled",
        () => {
            expect(updateRunningStreamsDeployConfig.envVars).toContain(
                "RUNNING_INSTANCES_TABLE_NAME",
            );
        },
    );
});
