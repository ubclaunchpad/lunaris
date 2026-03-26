import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { ObservabilityStack } from "../lib/observability-stack";

describe("ObservabilityStack", () => {
    it("creates dashboard and alarms for operational visibility", () => {
        const app = new cdk.App();
        const stack = new ObservabilityStack(app, "ObservabilityStackTest");
        const template = Template.fromStack(stack);

        template.resourceCountIs("AWS::CloudWatch::Dashboard", 1);
        template.resourceCountIs("AWS::CloudWatch::Alarm", 2);

        template.hasResourceProperties("AWS::CloudWatch::Alarm", {
            Threshold: 10,
            ComparisonOperator: "GreaterThanThreshold",
        });

        template.hasResourceProperties("AWS::CloudWatch::Alarm", {
            Threshold: 0.5,
            Metrics: Match.arrayWith([
                Match.objectLike({
                    Expression: "IF((failed + succeeded) > 0, failed / (failed + succeeded), 0)",
                }),
            ]),
        });
    });
});
