import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from "@aws-sdk/client-ssm";

type ConfigureDcvEvent = {
    instanceId: string;
    dcvIp: string;
    dcvPassword: string;
};

type ConfigureDcvResult = {
    success: boolean;
    sslConfigured: boolean;
    passwordSet: boolean;
    message: string;
};

const ssmClient = new SSMClient({ region: process.env.AWS_REGION || "us-west-2" });
const SSM_SEND_RETRY_TIMEOUT_MS = Number(process.env.SSM_SEND_RETRY_TIMEOUT_MS ?? "240000");
const SSM_SEND_RETRY_DELAY_MS = Number(process.env.SSM_SEND_RETRY_DELAY_MS ?? "15000");

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableSsmSendError(err: unknown): err is Error {
    if (!(err instanceof Error)) {
        return false;
    }

    const errorText = `${err.name} ${err.message}`;
    return errorText.includes("InvalidInstanceId") || errorText.includes("TargetNotConnected");
}

/**
 * Waits for an SSM command to complete and returns the result
 */
async function waitForCommand(
    commandId: string,
    instanceId: string,
    timeoutMs: number = 120000,
): Promise<{ success: boolean; output: string; error: string }> {
    const startTime = Date.now();
    const pollInterval = 5000;

    while (Date.now() - startTime < timeoutMs) {
        try {
            const result = await ssmClient.send(
                new GetCommandInvocationCommand({
                    CommandId: commandId,
                    InstanceId: instanceId,
                }),
            );

            if (result.Status === "Success") {
                return {
                    success: true,
                    output: result.StandardOutputContent || "",
                    error: result.StandardErrorContent || "",
                };
            } else if (
                result.Status === "Failed" ||
                result.Status === "Cancelled" ||
                result.Status === "TimedOut"
            ) {
                return {
                    success: false,
                    output: result.StandardOutputContent || "",
                    error: result.StandardErrorContent || result.StatusDetails || "Command failed",
                };
            }
            // Still in progress, wait and retry
            await sleep(pollInterval);
        } catch (err: unknown) {
            // InvocationDoesNotExist means the command hasn't started yet
            if (err instanceof Error && err.name === "InvocationDoesNotExist") {
                await sleep(pollInterval);
                continue;
            }
            throw err;
        }
    }

    return { success: false, output: "", error: "Command timed out" };
}

/**
 * Runs a PowerShell command on the instance via SSM
 */
async function runCommand(
    instanceId: string,
    commands: string[],
): Promise<{ success: boolean; output: string; error: string }> {
    const startTime = Date.now();
    let lastRetryableError: Error | null = null;

    while (Date.now() - startTime < SSM_SEND_RETRY_TIMEOUT_MS) {
        try {
            const response = await ssmClient.send(
                new SendCommandCommand({
                    InstanceIds: [instanceId],
                    DocumentName: "AWS-RunPowerShellScript",
                    Parameters: {
                        commands: commands,
                    },
                    TimeoutSeconds: 300,
                }),
            );

            if (!response.Command?.CommandId) {
                throw new Error("Failed to send SSM command");
            }

            return waitForCommand(response.Command.CommandId, instanceId);
        } catch (err: unknown) {
            if (!isRetryableSsmSendError(err)) {
                throw err;
            }

            lastRetryableError = err;
            console.warn(
                `SSM target ${instanceId} not ready yet (${err.name}). Retrying in ${SSM_SEND_RETRY_DELAY_MS}ms...`,
            );
            await sleep(SSM_SEND_RETRY_DELAY_MS);
        }
    }

    const errorMessage = lastRetryableError?.message || "SSM target did not become ready";
    throw new Error(
        `SSM target ${instanceId} was not ready after ${Math.round(SSM_SEND_RETRY_TIMEOUT_MS / 1000)} seconds: ${errorMessage}`,
    );
}

/**
 * Configures a DCV instance after deployment:
 * 1. Sets Administrator password
 * 2. Disables IE Enhanced Security
 * 3. Sets up Let's Encrypt SSL certificate
 * 4. Restarts DCV with the new certificate
 */
export const handler = async (event: ConfigureDcvEvent): Promise<ConfigureDcvResult> => {
    console.log("Configuring DCV instance:", JSON.stringify(event));

    const { instanceId, dcvIp, dcvPassword } = event;

    if (!instanceId || !dcvIp || !dcvPassword) {
        throw new Error("Missing required fields: instanceId, dcvIp, dcvPassword");
    }

    // Convert IP to nip.io domain format
    const nipDomain = dcvIp.replace(/\./g, "-") + ".nip.io";
    let passwordSet = false;
    let sslConfigured = false;

    try {
        // Step 1: Set Administrator password
        console.log("Setting Administrator password...");
        const passwordResult = await runCommand(instanceId, [
            `$SecurePassword = ConvertTo-SecureString '${dcvPassword}' -AsPlainText -Force`,
            `$UserAccount = Get-LocalUser -Name "Administrator"`,
            `$UserAccount | Set-LocalUser -Password $SecurePassword`,
            `Write-Host "Password set successfully"`,
        ]);

        if (!passwordResult.success) {
            throw new Error(`Failed to set password: ${passwordResult.error}`);
        }
        passwordSet = true;
        console.log("Password set successfully");

        // Step 2: Ensure the Windows firewall exposes DCV HTTPS publicly
        console.log("Ensuring DCV firewall rule exists...");
        const firewallResult = await runCommand(instanceId, [
            `$rule = Get-NetFirewallRule -DisplayName "Lunaris DCV HTTPS" -ErrorAction SilentlyContinue`,
            `if (-not $rule) {`,
            `  New-NetFirewallRule -DisplayName "Lunaris DCV HTTPS" -Direction Inbound -Protocol TCP -LocalPort 8443 -Action Allow -Profile Any | Out-Null`,
            `  Write-Host "DCV firewall rule created"`,
            `} else {`,
            `  Write-Host "DCV firewall rule already exists"`,
            `}`,
        ]);

        if (!firewallResult.success) {
            throw new Error(`Failed to configure firewall rule: ${firewallResult.error}`);
        }

        // Step 3: Disable IE Enhanced Security
        console.log("Disabling IE Enhanced Security...");
        const ieResult = await runCommand(instanceId, [
            `$AdminKey = "HKLM:\\SOFTWARE\\Microsoft\\Active Setup\\Installed Components\\{A509B1A7-37EF-4b3f-8CFC-4F3A74704073}"`,
            `$UserKey = "HKLM:\\SOFTWARE\\Microsoft\\Active Setup\\Installed Components\\{A509B1A8-37EF-4b3f-8CFC-4F3A74704073}"`,
            `Set-ItemProperty -Path $AdminKey -Name "IsInstalled" -Value 0 -Force -ErrorAction SilentlyContinue`,
            `Set-ItemProperty -Path $UserKey -Name "IsInstalled" -Value 0 -Force -ErrorAction SilentlyContinue`,
        ]);

        if (!ieResult.success) {
            throw new Error(`Failed to disable IE Enhanced Security: ${ieResult.error}`);
        }

        // Step 4: Create directories and download win-acme
        console.log("Setting up SSL certificate...");
        const downloadResult = await runCommand(instanceId, [
            `New-Item -ItemType Directory -Force -Path C:\\win-acme | Out-Null`,
            `New-Item -ItemType Directory -Force -Path C:\\DCV-Certs | Out-Null`,
            `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12`,
            `if (-not (Test-Path "C:\\win-acme\\wacs.exe")) {`,
            `  Invoke-WebRequest -Uri "https://github.com/win-acme/win-acme/releases/download/v2.2.9.1701/win-acme.v2.2.9.1701.x64.pluggable.zip" -OutFile "C:\\win-acme\\win-acme.zip" -UseBasicParsing`,
            `  Expand-Archive -Path "C:\\win-acme\\win-acme.zip" -DestinationPath "C:\\win-acme" -Force`,
            `}`,
            `Write-Host "win-acme ready"`,
        ]);

        if (!downloadResult.success) {
            throw new Error(`Failed to prepare win-acme: ${downloadResult.error}`);
        }

        // Step 5: Open firewall and request certificate
        console.log("Requesting Let's Encrypt certificate for", nipDomain);
        const certResult = await runCommand(instanceId, [
            `Get-ChildItem -Path "C:\\DCV-Certs" -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue`,
            `New-NetFirewallRule -DisplayName "Allow HTTP for ACME" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -ErrorAction SilentlyContinue | Out-Null`,
            `& "C:\\win-acme\\wacs.exe" --source manual --host ${nipDomain} --validation selfhosting --store pemfiles --pemfilespath C:\\DCV-Certs --installation none --accepttos --emailaddress lunaris-ssl@noreply.lunaris.cloud`,
            `if ($LASTEXITCODE -ne 0) {`,
            `  Write-Error "win-acme exited with code $LASTEXITCODE"`,
            `  exit 1`,
            `}`,
            `Write-Host "certificate ok"`,
        ]);

        if (!certResult.success) {
            throw new Error(`Failed to request SSL certificate: ${certResult.error}`);
        }
        console.log("Certificate request completed");

        // Step 6: Copy certificate to DCV location and restart
        const copyResult = await runCommand(instanceId, [
            `$DcvCertDir = "C:\\Windows\\system32\\config\\systemprofile\\AppData\\Local\\NICE\\dcv\\private"`,
            `New-Item -ItemType Directory -Force -Path $DcvCertDir | Out-Null`,
            `$CertFile = $null`,
            `$KeyFile = $null`,
            `for ($i = 0; $i -lt 12; $i++) {`,
            `  $CertFile = Get-ChildItem -Path "C:\\DCV-Certs" -Recurse -File -Filter "*-chain.pem" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1`,
            `  if (-not $CertFile) {`,
            `    $CertFile = Get-ChildItem -Path "C:\\DCV-Certs" -Recurse -File -Filter "*-fullchain.pem" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1`,
            `  }`,
            `  if (-not $CertFile) {`,
            `    $CertFile = Get-ChildItem -Path "C:\\DCV-Certs" -Recurse -File -Filter "*-crt.pem" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1`,
            `  }`,
            `  $KeyFile = Get-ChildItem -Path "C:\\DCV-Certs" -Recurse -File -Filter "*-key.pem" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1`,
            `  if ($CertFile -and $KeyFile) { break }`,
            `  Start-Sleep -Seconds 5`,
            `}`,
            `if (-not ($CertFile -and $KeyFile)) {`,
            `  Write-Host "DCV cert directory contents:"`,
            `  Get-ChildItem -Path "C:\\DCV-Certs" -Recurse -ErrorAction SilentlyContinue | Select-Object FullName,Length,LastWriteTime | Format-Table -AutoSize | Out-String | Write-Host`,
            `  Write-Error "Certificate files not found"`,
            `  exit 1`,
            `}`,
            `Copy-Item -Path $CertFile.FullName -Destination "$DcvCertDir\\dcv.pem" -Force`,
            `Copy-Item -Path $KeyFile.FullName -Destination "$DcvCertDir\\dcv.key" -Force`,
            `Restart-Service -Name "dcvserver" -Force -ErrorAction Stop`,
            `$listening = $false`,
            `for ($i = 0; $i -lt 12; $i++) {`,
            `  $test = Test-NetConnection -ComputerName localhost -Port 8443 -WarningAction SilentlyContinue`,
            `  if ($test.TcpTestSucceeded) {`,
            `    $listening = $true`,
            `    break`,
            `  }`,
            `  Start-Sleep -Seconds 5`,
            `}`,
            `if (-not $listening) {`,
            `  Write-Error "Port 8443 not listening after DCV restart"`,
            `  exit 1`,
            `}`,
            `Write-Host "SSL configured and DCV restarted"`,
        ]);

        if (!copyResult.success) {
            throw new Error(`Failed to install SSL certificate into DCV: ${copyResult.error}`);
        }
        if (!copyResult.output.includes("SSL configured")) {
            throw new Error("DCV SSL restart did not complete successfully");
        }

        sslConfigured = true;
        console.log("SSL configured successfully");

        return {
            success: passwordSet && sslConfigured,
            passwordSet,
            sslConfigured,
            message: `Password: ${passwordSet ? "OK" : "FAILED"}, SSL: ${sslConfigured ? "OK" : "FAILED"}`,
        };
    } catch (err: unknown) {
        console.error("Configuration error:", err);
        throw err instanceof Error ? err : new Error("Unknown error");
    }
};
