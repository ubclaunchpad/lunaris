import * as fs from "fs";
import * as path from "path";
import { LambdaFunctionConfig } from "./lambda-types";

/**
 * Registry for managing Lambda function configurations.
 * Discovers configs from cdk/lambdas/*.config.ts files at synthesis time.
 */
export class LambdaRegistry {
    private static configs: Map<string, LambdaFunctionConfig> = new Map();

    /**
     * Register a Lambda function configuration.
     * @throws Error if a config with the same functionName is already registered
     */
    public static registerLambda(config: LambdaFunctionConfig): void {
        if (this.configs.has(config.functionName)) {
            throw new Error(`Lambda '${config.functionName}' is already registered`);
        }
        this.configs.set(config.functionName, config);
    }

    public static getLambda(functionName: string): LambdaFunctionConfig | undefined {
        return this.configs.get(functionName);
    }

    public static getAllLambdas(): LambdaFunctionConfig[] {
        return Array.from(this.configs.values());
    }

    public static hasLambda(functionName: string): boolean {
        return this.configs.has(functionName);
    }

    /** Clear all registered configs — used in tests to reset state between runs */
    public static clearRegistry(): void {
        this.configs.clear();
    }

    /**
     * Discover and register all Lambda configs from the lambdas/ directory.
     * Scans for *.config.ts (dev) and *.config.js (compiled) files.
     * @param lambdasPath Optional override path to the lambdas directory
     */
    public static discoverLambdas(lambdasPath?: string): void {
        const dir = lambdasPath || path.join(__dirname, "../../../lambdas");

        if (!fs.existsSync(dir)) {
            console.warn(`Lambdas directory not found at: ${dir}`);
            return;
        }

        try {
            const configFiles = fs
                .readdirSync(dir)
                .filter((f) => f.endsWith(".config.ts") || f.endsWith(".config.js"));

            for (const file of configFiles) {
                const configPath = path.join(dir, file);
                try {
                    const mod = require(configPath);
                    const config = mod.default || mod;

                    if (this.isValidConfig(config)) {
                        if (!this.hasLambda(config.functionName)) {
                            this.registerLambda(config);
                        }
                    } else {
                        console.warn(`Invalid lambda config at: ${configPath}`);
                    }
                } catch (error) {
                    console.warn(`Failed to load lambda config from ${configPath}:`, error);
                }
            }
        } catch (error) {
            console.warn(`Failed to discover lambdas in ${dir}:`, error);
        }
    }

    private static isValidConfig(config: unknown): config is LambdaFunctionConfig {
        if (!config || typeof config !== "object") return false;
        const c = config as Record<string, unknown>;
        return (
            typeof c.functionName === "string" &&
            typeof c.constructId === "string" &&
            typeof c.handler === "string" &&
            typeof c.description === "string"
        );
    }
}
