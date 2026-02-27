import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";

export function getDeployEC2Policies(): PolicyStatement[] {
    return [
        new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["ssm:GetParameter"],
            resources: ["arn:aws:ssm:*:*:parameter/ami_id"],
        }),
        new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                "ec2:RunInstances",
                "ec2:DescribeInstances",
                "ec2:DescribeInstanceStatus",
                "ec2:CreateTags",
                "ec2:DescribeSecurityGroups",
                "ec2:DescribeSubnets",
                "ec2:DescribeKeyPairs",
            ],
            resources: ["*"],
        }),
        new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["iam:PassRole"],
            resources: ["*"],
        }),
        new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                "ssm:SendCommand",
                "ssm:GetCommandInvocation",
                "ssm:CreateDocument",
                "ssm:GetDocument",
            ],
            resources: ["*"],
        }),
    ];
}
export function getStartEC2Policies(): PolicyStatement[] {
    return [
        new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
                "ec2:StartInstances",
                "ec2:DescribeInstances",
                "ec2:DescribeInstanceStatus",
            ],
            resources: ["*"],
        }),
    ];
}

export function getConfigureDcvInstancePolicies(): PolicyStatement[] {
    return [
        new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["ssm:SendCommand", "ssm:GetCommandInvocation"],
            resources: ["*"],
        }),
        new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["ec2:DescribeInstances"],
            resources: ["*"],
        }),
    ];
}

export function getStopEC2Policies(): PolicyStatement[] {
    return [
        new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["ec2:StopInstances", "ec2:DescribeInstances"],
            resources: ["*"],
        }),
    ];
}

export function getTerminateEC2Policies(): PolicyStatement[] {
    return [
        new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["ec2:TerminateInstances", "ec2:DescribeInstances"],
            resources: ["*"],
        }),
    ];
}

// TOOD: finish policystatement
export function getStopDCVInstancePolicies(): PolicyStatement[] {
    return [
        new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["ssm:SendCommand", "ssm:GetCommandInvocation"],
            resources: ["*"],
        }),
        new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["ec2:DescribeInstances"],
            resources: ["*"],
        }),
    ];
}
