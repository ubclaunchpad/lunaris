import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { EC2InstanceRole } from "./constructs/iam/ec2-instance-role";

export class IAMStack extends Stack {
    public readonly ec2InstanceRole: EC2InstanceRole;
    public readonly ec2InstanceProfileArn: string;
    public readonly ec2InstanceProfileName: string;
    public readonly ec2InstanceRoleArn: string;

    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, {
            ...props,
            env: {
                account: process.env.CDK_DEFAULT_ACCOUNT,
                region: process.env.CDK_DEFAULT_REGION,
            },
        });

        // EC2 instance role for DCV streaming instances (SSM, CloudWatch, describe permissions)
        this.ec2InstanceRole = new EC2InstanceRole(this, "EC2InstanceRole");
        this.ec2InstanceProfileArn = this.ec2InstanceRole.instanceProfileArn;
        this.ec2InstanceProfileName = this.ec2InstanceRole.instanceProfileName;
        this.ec2InstanceRoleArn = this.ec2InstanceRole.role.roleArn;
    }
}
