import EC2Wrapper, { type EC2InstanceConfig } from "../../utils/ec2Wrapper";
import { type _InstanceType } from "@aws-sdk/client-ec2";
import {
    publishActiveInstancesRealtimeCount,
    publishDeploymentFailed,
    publishDeploymentStarted,
    publishDeploymentSucceeded,
} from "../../utils/cloudWatchMetrics";
import { randomBytes } from "crypto";

type DeployEc2Event = {
    userId: string;
    gameId: string;
    amiId: string;
    instanceType?: string;
};

type DeployEC2Success = {
    success: boolean;
    instanceId: string;
    instanceArn: string;
    ebsVolumeId: string;
    dcvIp: string;
    dcvPort: number;
    dcvUser: string;
    dcvPassword: string;
    creationTime: string;
};

type DeployEC2Error = {
    success: false;
    error: string;
};

/**
 * Generates a cryptographically secure random password for DCV instances.
 * Each instance gets a unique password that is stored in DynamoDB.
 */
function generateSecurePassword(length: number = 24): string {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    const bytes = randomBytes(length);
    let password = "";
    for (let i = 0; i < length; i++) {
        password += charset[bytes[i] % charset.length];
    }
    return password;
}

/**
 * Generates a PowerShell user data script for Windows DCV instances.
 * This script runs on first boot and can be used to configure the instance.
 */
function generateWindowsUserData(dcvPassword: string): string {
    // PowerShell script that runs on Windows instance startup
    return `<powershell>
# Log startup
Write-Host "Lunaris DCV Instance Starting..."
$LogFile = "C:\\ProgramData\\Lunaris\\startup.log"
New-Item -ItemType Directory -Force -Path "C:\\ProgramData\\Lunaris" | Out-Null
New-Item -ItemType Directory -Force -Path "C:\\DCV-Certs" | Out-Null
New-Item -ItemType Directory -Force -Path "C:\\win-acme" | Out-Null

function Write-Log {
    param([string]$Message)
    "$(Get-Date) - $Message" | Out-File -Append $LogFile
}

function Get-MetadataValue {
    param([string]$Path)
    try {
        $Token = Invoke-RestMethod -Method Put -Uri "http://169.254.169.254/latest/api/token" -Headers @{ "X-aws-ec2-metadata-token-ttl-seconds" = "21600" } -TimeoutSec 10
        return Invoke-RestMethod -Uri "http://169.254.169.254/latest/meta-data/$Path" -Headers @{ "X-aws-ec2-metadata-token" = $Token } -TimeoutSec 10
    } catch {
        return Invoke-RestMethod -Uri "http://169.254.169.254/latest/meta-data/$Path" -TimeoutSec 10
    }
}

function Get-PublicIpWithRetry {
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $PublicIp = Get-MetadataValue -Path "public-ipv4"
            if ($PublicIp) {
                return $PublicIp
            }
        } catch {
            Write-Log "Public IP metadata not ready yet: $_"
        }
        Start-Sleep -Seconds 10
    }

    throw "Timed out waiting for public IPv4 metadata"
}

# Set Administrator password
try {
    $SecurePassword = ConvertTo-SecureString "${dcvPassword}" -AsPlainText -Force
    $UserAccount = Get-LocalUser -Name "Administrator"
    $UserAccount | Set-LocalUser -Password $SecurePassword
    Write-Log "Administrator password set successfully"
} catch {
    Write-Log "Failed to set Administrator password: $_"
}

# Ensure Windows firewall allows DCV HTTPS traffic
try {
    $dcvFirewallRule = Get-NetFirewallRule -DisplayName "Lunaris DCV HTTPS" -ErrorAction SilentlyContinue
    if (-not $dcvFirewallRule) {
        New-NetFirewallRule -DisplayName "Lunaris DCV HTTPS" -Direction Inbound -Protocol TCP -LocalPort 8443 -Action Allow -Profile Any | Out-Null
        Write-Log "DCV firewall rule created"
    } else {
        Write-Log "DCV firewall rule already exists"
    }
} catch {
    Write-Log "Failed to configure DCV firewall rule: $_"
}

# Ensure Windows firewall allows ACME HTTP validation
try {
    $acmeFirewallRule = Get-NetFirewallRule -DisplayName "Lunaris ACME HTTP" -ErrorAction SilentlyContinue
    if (-not $acmeFirewallRule) {
        New-NetFirewallRule -DisplayName "Lunaris ACME HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Profile Any | Out-Null
        Write-Log "ACME HTTP firewall rule created"
    } else {
        Write-Log "ACME HTTP firewall rule already exists"
    }
} catch {
    Write-Log "Failed to configure ACME HTTP firewall rule: $_"
}

# Ensure DCV server is running
try {
    $dcvService = Get-Service -Name "dcvserver" -ErrorAction SilentlyContinue
    if ($dcvService) {
        if ($dcvService.Status -ne 'Running') {
            Start-Service -Name "dcvserver"
            Write-Log "DCV Server started"
        } else {
            Write-Log "DCV Server already running"
        }
    } else {
        Write-Log "DCV Server service not found"
    }
} catch {
    Write-Log "Error managing DCV service: $_"
}

# Create a console session for Administrator if not exists
try {
    & "C:\\Program Files\\NICE\\DCV\\Server\\bin\\dcv.exe" create-session --type=console --owner Administrator console 2>&1 | Out-File -Append $LogFile
    Write-Log "DCV session created or already exists"
} catch {
    Write-Log "Error creating DCV session: $_"
}

# Install or refresh the browser-trusted certificate for the current public nip.io hostname
try {
    $PublicIp = Get-PublicIpWithRetry
    $NipDomain = ($PublicIp -replace "\\.", "-") + ".nip.io"
    Write-Log "Preparing certificate for $NipDomain"

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    if (-not (Test-Path "C:\\win-acme\\wacs.exe")) {
        Invoke-WebRequest -Uri "https://github.com/win-acme/win-acme/releases/download/v2.2.9.1701/win-acme.v2.2.9.1701.x64.pluggable.zip" -OutFile "C:\\win-acme\\win-acme.zip" -UseBasicParsing
        Expand-Archive -Path "C:\\win-acme\\win-acme.zip" -DestinationPath "C:\\win-acme" -Force
        Write-Log "win-acme downloaded"
    } else {
        Write-Log "win-acme already present"
    }

    Get-ChildItem -Path "C:\\DCV-Certs" -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

    & "C:\\win-acme\\wacs.exe" --source manual --host $NipDomain --validation selfhosting --store pemfiles --pemfilespath C:\\DCV-Certs --installation none --accepttos --emailaddress lunaris-ssl@noreply.lunaris.cloud 2>&1 | Out-File -Append $LogFile

    $DcvCertDir = "C:\\Windows\\system32\\config\\systemprofile\\AppData\\Local\\NICE\\dcv\\private"
    $CertFile = Get-ChildItem -Path "C:\\DCV-Certs" -Filter "*-crt.pem" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $KeyFile = Get-ChildItem -Path "C:\\DCV-Certs" -Filter "*-key.pem" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

    if ($CertFile -and $KeyFile) {
        Copy-Item -Path $CertFile.FullName -Destination "$DcvCertDir\\dcv.pem" -Force
        Copy-Item -Path $KeyFile.FullName -Destination "$DcvCertDir\\dcv.key" -Force
        Restart-Service dcvserver -Force
        Start-Sleep -Seconds 10
        $LocalDcvPort = Test-NetConnection -ComputerName localhost -Port 8443 -WarningAction SilentlyContinue
        if ($LocalDcvPort.TcpTestSucceeded) {
            Write-Log "DCV certificate installed and HTTPS listener is ready"
        } else {
            Write-Log "DCV HTTPS listener did not become ready after certificate install"
        }
    } else {
        Write-Log "Certificate files were not generated for $NipDomain"
    }
} catch {
    Write-Log "Failed to configure DCV certificate: $_"
}

Write-Log "Startup script completed"
</powershell>
<persist>true</persist>`;
}

export const handler = async (
    event: DeployEc2Event,
): Promise<DeployEC2Success | DeployEC2Error> => {
    await publishDeploymentStarted();

    try {
        const { userId, gameId, amiId, instanceType } = event;

        if (!amiId) {
            throw new Error("AMI ID is required but was not provided in the event");
        }

        console.log(`Deploying game '${gameId}' using AMI: ${amiId}`);

        const ec2Wrapper = new EC2Wrapper(process.env.LAMBDA_REGION || "us-west-2");

        // Generate a unique password for this instance
        // This password is stored in DynamoDB (encrypted at rest) alongside the session data
        const dcvPassword = generateSecurePassword();

        const instanceConfig: EC2InstanceConfig = {
            userId,
            amiId,
            instanceType: instanceType as _InstanceType | undefined,
            securityGroupIds: process.env.SECURITY_GROUP_ID
                ? [process.env.SECURITY_GROUP_ID]
                : undefined,
            subnetId: process.env.SUBNET_ID,
            keyName: process.env.KEY_PAIR_NAME,
            iamInstanceProfile: process.env.EC2_INSTANCE_PROFILE_NAME,
            userDataScript: generateWindowsUserData(dcvPassword),
            tags: { GameId: gameId },
        };

        const instance = await ec2Wrapper.createAndWaitForInstance(instanceConfig);
        const now = new Date().toISOString();

        await publishDeploymentSucceeded();
        await publishActiveInstancesRealtimeCount(1);

        return {
            success: true,
            instanceId: instance.instanceId,
            instanceArn: instance.instanceArn,
            ebsVolumeId: "",
            dcvIp: instance.publicIp || "",
            dcvPort: 8443,
            dcvUser: "Administrator",
            dcvPassword: dcvPassword,
            creationTime: now,
        };
    } catch (err: unknown) {
        await publishDeploymentFailed();

        if (err instanceof Error) {
            console.error("Instance deployment failed:", err);
            return {
                success: false,
                error: err.message || "Unknown error during instance creation",
            };
        }

        return { success: false, error: String(err) };
    }
};
