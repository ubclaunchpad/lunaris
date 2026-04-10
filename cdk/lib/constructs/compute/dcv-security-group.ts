import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { CfnOutput } from "aws-cdk-lib";

/**
 * Security Group for DCV streaming instances
 *
 * Allows:
 * - Port 8443 (HTTPS) for DCV web client connections
 * - Port 80 (HTTP) for Let's Encrypt ACME certificate validation
 * - Port 3389 (RDP) only if CDK context `adminCidr` is set (omitted by default for production safety)
 *   Example: cdk deploy -c adminCidr=203.0.113.0/24
 */
export class DCVSecurityGroup extends Construct {
    public readonly securityGroup: ec2.ISecurityGroup;
    public readonly securityGroupId: string;

    constructor(scope: Construct, id: string) {
        super(scope, id);

        // Look up the default VPC
        const vpc = ec2.Vpc.fromLookup(this, "DefaultVPC", {
            isDefault: true,
        });

        // Create security group for DCV instances
        const sg = new ec2.SecurityGroup(this, "DCVInstanceSG", {
            vpc,
            description: "Security group for DCV streaming instances",
            allowAllOutbound: true,
        });

        // DCV HTTPS port (primary connection)
        sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(8443), "Allow DCV HTTPS connections");

        // HTTP port for Let's Encrypt ACME certificate validation
        sg.addIngressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(80),
            "Allow HTTP for ACME certificate validation",
        );

        // RDP (port 3389) is disabled by default. To enable for admin access, pass:
        //   cdk deploy -c adminCidr=<your-ip>/32
        const adminCidr = this.node.tryGetContext("adminCidr") as string | undefined;
        if (adminCidr) {
            sg.addIngressRule(
                ec2.Peer.ipv4(adminCidr),
                ec2.Port.tcp(3389),
                `Allow RDP from admin CIDR ${adminCidr}`,
            );
        }

        this.securityGroup = sg;
        this.securityGroupId = sg.securityGroupId;

        // Output the security group ID
        new CfnOutput(this, "SecurityGroupId", {
            value: sg.securityGroupId,
            description: "Security Group ID for DCV instances",
            exportName: "DCVSecurityGroupId",
        });
    }
}
