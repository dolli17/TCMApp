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
);
