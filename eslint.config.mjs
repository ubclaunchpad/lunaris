import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import eslintJs from "@eslint/js";
import tseslint from "typescript-eslint";
import cdkPlugin from "eslint-plugin-awscdk";
import eslintConfigPrettier from "eslint-config-prettier/flat";

// Use FlatCompat to apply legacy eslint configs (like next/core-web-vitals)
// in the new flat config. baseDirectory points to the frontend folder so Next
// plugins resolve correctly in a monorepo (Next needs to be installed alongside its eslint config)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: join(__dirname, "frontend") });

// TODO: look into parserOptions, languageOptions
// TODO: fix npx eslint cdk/scripts/validate-cloudformation.js
export default defineConfig([
    globalIgnores(["node_modules/**"]),
    eslintConfigPrettier,
    {
        files: ["**/*.{js,jsx,mjs,cjs}"],
        extends: [eslintJs.configs.recommended],
    },
    {
        files: ["**/*.{ts,tsx,mts,cts}"],
        extends: [...tseslint.configs.recommended],
    },
    // Frontend config
    ...compat.extends("next/core-web-vitals", "next/typescript").map((config) => ({
        ...config,
        files: ["frontend/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
    })),
    {
        settings: {
            next: {
                rootDir: "frontend/",
            },
        },
        files: ["frontend/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
        ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
        languageOptions: { globals: { ...globals.browser } },
    },
    // CDK config
    // TODO: this config is really slow, either:
    // a) need to fix the ts parsing issue or 2) this cdk plugin is just slow
    {
        files: ["cdk/**/*.{ts,mts,cts,js,mjs,cjs}"],
        extends: [cdkPlugin.configs.recommended],
        languageOptions: {
            globals: { ...globals.node },
        },
    },
]);
