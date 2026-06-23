// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import angular from "@angular-eslint/eslint-plugin";
import angularTemplate from "@angular-eslint/eslint-plugin-template";
import angularTemplateParser from "@angular-eslint/template-parser";
import perfectionist from "eslint-plugin-perfectionist";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // --- TypeScript files ---
  {
    files: ["**/*.ts"],
    plugins: {
      "@angular-eslint": angular,
      "@typescript-eslint": tseslint.plugin,
      "perfectionist": perfectionist,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      // Visibilità: public implicito, private e protected espliciti
      "@typescript-eslint/explicit-member-accessibility": ["error", {
        "accessibility": "no-public",
      }],

      // Ordine dei membri (con auto-fix)
      "perfectionist/sort-classes": ["error", {
        "type": "natural",
        "order": "asc",
        "groups": [
          // Campi statici
          "private-static-property",
          "protected-static-property",
          "static-property",

          // Proprietà pubbliche (input, output, viewChild, signal esposti)
          "property",

          // Proprietà protected (computed/signal solo per template)
          "protected-property",

          // Proprietà private (stato interno, injection)
          "private-property",

          // Costruttore
          "constructor",

          // Metodi pubblici
          "method",

          // Metodi protected (chiamati solo dal template)
          "protected-method",

          // Metodi privati
          "private-method",
        ]
      }],

      // Readonly dove possibile
      "@typescript-eslint/prefer-readonly": "error",

      // Signals e Angular
      "@angular-eslint/prefer-signals": "error",
      "@angular-eslint/no-output-on-prefix": "error",
      "@angular-eslint/prefer-output-readonly": "error",
    },
  },

  // --- Template files ---
  {
    files: ["**/*.html"],
    plugins: {
      "@angular-eslint/template": angularTemplate,
    },
    languageOptions: {
      parser: angularTemplateParser,
    },
    rules: {
      "@angular-eslint/template/no-negated-async": "error",
    },
  },

  // --- Ignora build e dipendenze ---
  {
    ignores: ["dist/", "node_modules/", ".angular/"],
  }
);