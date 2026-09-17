// ESLint flat config — Client (package `punto-venta-client`, React/Vite/TS).
// A diferencia del API (TS 7 → Babel sin type-info), el client usa TypeScript
// 5.6, así que aquí SÍ usamos typescript-eslint con type-check real.
// Styling: double-quotes + semicolons (consistente con el API).
import js from "@eslint/js";
import globals from "globals";
import ts from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default ts.config(
  // Los configs/bundlers (.js/.ts de build) no están en el tsconfig del app:
  // excluidos del type-check para que las reglas type-aware no rompan.
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "eslint.config.js",
      "vite.config.ts",
      "vitest.config.ts",
      "postcss.config.js",
      "tailwind.config.ts",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...ts.configs.recommendedTypeChecked,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
      globals: { ...globals.browser },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      quotes: ["error", "double"],
      semi: ["error", "always"],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
);
