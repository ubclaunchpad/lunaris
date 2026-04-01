import { Duration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
    Alarm,
    ComparisonOperator,
    Dashboard,
    GraphWidget,
    MathExpression,
    Metric,
    TreatMissingData,
} from "aws-cdk-lib/aws-cloudwatch";

const NAMESPACE = "Lunaris";

export class ObservabilityStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, {
            ...props,
            env: {
                account: process.env.CDK_DEFAULT_ACCOUNT,
                region: process.env.CDK_DEFAULT_REGION,
            },
        });

        const activeInstancesReconciledMetric = new Metric({
            namespace: NAMESPACE,
            metricName: "ActiveInstancesReconciled",
            period: Duration.minutes(5),
            statistic: "Maximum",
        });

        const activeInstancesRealtimeMetric = new Metric({
            namespace: NAMESPACE,
            metricName: "ActiveInstancesRealtime",
            period: Duration.minutes(1),
            statistic: "Maximum",
        });

        const deploymentsSucceededMetric = new Metric({
            namespace: NAMESPACE,
            metricName: "DeploymentsSucceeded",
            period: Duration.hours(1),
            statistic: "Sum",
        });

        const deploymentsFailedMetric = new Metric({
            namespace: NAMESPACE,
            metricName: "DeploymentsFailed",
            period: Duration.hours(1),
            statistic: "Sum",
        });

        const failureRateMetric = new MathExpression({
            label: "DeploymentFailureRate",
            expression: "IF((failed + succeeded) > 0, failed / (failed + succeeded), 0)",
            usingMetrics: {
                failed: deploymentsFailedMetric,
                succeeded: deploymentsSucceededMetric,
            },
            period: Duration.hours(1),
        });

        new Alarm(this, "ActiveInstancesHighAlarm", {
            metric: activeInstancesReconciledMetric,
            threshold: 10,
            evaluationPeriods: 1,
            datapointsToAlarm: 1,
            comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
            treatMissingData: TreatMissingData.NOT_BREACHING,
            alarmDescription:
                "Triggers when reconciled active instance count (DynamoDB) exceeds 10 over 5 minutes",
        });

        new Alarm(this, "DeploymentFailureRateHighAlarm", {
            metric: failureRateMetric,
            threshold: 0.5,
            evaluationPeriods: 1,
            datapointsToAlarm: 1,
            comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
            treatMissingData: TreatMissingData.NOT_BREACHING,
            alarmDescription: "Triggers when deployment failure rate exceeds 50% over one hour",
        });

        const dashboard = new Dashboard(this, "LunarisOperationalDashboard", {
            dashboardName: "Lunaris-Operational-Visibility",
        });

        dashboard.addWidgets(
            new GraphWidget({
                title: "Active Instances (Reconciled vs Realtime)",
                width: 12,
                left: [activeInstancesReconciledMetric, activeInstancesRealtimeMetric],
            }),
            new GraphWidget({
                title: "Deployments (Hourly)",
                width: 12,
                left: [deploymentsSucceededMetric, deploymentsFailedMetric],
            }),
            new GraphWidget({
                title: "Deployment Failure Rate (Hourly)",
                width: 12,
                left: [failureRateMetric],
            }),
            new GraphWidget({
                title: "Session and Cost",
                width: 12,
                left: [
                    new Metric({
                        namespace: NAMESPACE,
                        metricName: "AverageSessionDuration",
                        period: Duration.hours(1),
                        statistic: "Average",
                    }),
                    new Metric({
                        namespace: NAMESPACE,
                        metricName: "TotalCostEstimate",
                        period: Duration.hours(1),
                        statistic: "Sum",
                    }),
                ],
            }),
        );
    }
}
