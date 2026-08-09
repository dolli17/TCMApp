import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.expo/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/*.types.ts",
      "**/next-env.d.ts",
      // Arbeitsverzeichnisse der Supabase-CLI. Enthalten fremden,
      // minifizierten Code und sind bereits in .gitignore.
      "supabase/.temp/**",
      "supabase/.branches/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      // "x != null" prueft null und undefined zugleich und ist etabliert;
      // ueberall sonst bleibt strikte Gleichheit Pflicht.
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // Werkzeug-Konfigurationen laufen in Node und muessen CommonJS sein:
    // Metro laedt seine Konfiguration mit require, bevor irgendein
    // Modulsystem der App im Spiel ist.
    files: ["**/metro.config.js", "**/*.cjs"],
    languageOptions: {
      globals: { __dirname: "readonly", module: "writable", require: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
