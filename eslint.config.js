const js = require("@eslint/js");
const globals = require("globals");

// Konfigurasi ESLint flat (v9+). Frontend punya toolchain sendiri (Vite).
module.exports = [
  { ignores: ["frontend/**", "node_modules/**", "dist/**", "**/dist/**", "wa-dashboard.bundle"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-console": "off",
    },
  },
];
