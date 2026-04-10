import * as fs from "fs";
import * as path from "path";

describe("user-deploy workflow definition", () => {
    const definitionPath = path.join(
        __dirname,
        "..",
        "stepfunctions",
        "user-deploy-ec2",
        "definition.asl.json",
    );

    it("fails the workflow when ConfigureDcvInstance fails", () => {
        const definition = JSON.parse(fs.readFileSync(definitionPath, "utf8"));

        expect(definition.States.ConfigureDcvInstance.Catch).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    Next: "HandleConfigureDcvError",
                }),
            ]),
        );

        expect(definition.States.HandleConfigureDcvError).toEqual(
            expect.objectContaining({
                Type: "Fail",
                Error: "ConfigureDcvFailedError",
            }),
        );
    });
});
