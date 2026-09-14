// ESLint flat config — API (root package `punto-venta-api`).
// Opción A: ESLint core (sin type-info), single-quotes.
// Parser: @babel/eslint-parser (no depende de la versión de TS → compatible con TS 7).
// Scope: solo ./src. El client/ tiene su propio package.json y análisis aparte.
import js from "@eslint/js";
import globals from "globals";
import babelParser from "@babel/eslint-parser";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src/__tests__/**",
      "test/**",
      "tests/**",
      "playwright-report/**",
      "test-results/**",
      "prisma/**",
      "coverage/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ["@babel/preset-typescript"],
        },
        sourceType: "module",
        ecmaVersion: "latest",
      },
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      // Babel parsea anotaciones de tipo pero no las resuelve; tsc ya valida
      // variables reales. Apagar aquí es el patrón estándar sin type-info.
      "no-undef": "off",
      quotes: ["error", "single"],
      semi: ["error", "always"],
      // Los imports usados solo como tipos (Prisma.X, AppResult, *Input) no
      // cuentan como 'usados' para Babel -> falsos positivos. tsc con
      // noUnusedLocals:true ya detecta los reales; apagar.
      "no-unused-vars": "off",
      "no-fallthrough": "error",
    },
  },
];
