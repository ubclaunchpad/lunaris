import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import eslintJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier/flat';

// Use FlatCompat to apply legacy eslint configs (like next/core-web-vitals)
// in the new flat config. baseDirectory points to the frontend folder so Next
// plugins resolve correctly in a monorepo (Next needs to be installed alongside its eslint config)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: join(__dirname, 'frontend') });

export default defineConfig([
  globalIgnores(['node_modules/**']),
  eslintConfigPrettier,
  {
    files: ['**/*.{js,ts,jsx,tsx}'],
    extends: [eslintJs.configs.recommended, tseslint.configs.recommended],
    rules: {
      'no-unused-vars': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
  // Frontend config
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    settings: {
      next: {
        rootDir: 'frontend/',
      },
    },
    files: ['frontend/**/*.{js,ts,jsx,tsx}'],
    ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
]);
