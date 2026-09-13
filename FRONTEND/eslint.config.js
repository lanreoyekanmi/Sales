import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      // eslint-plugin-react-hooks@7's bundled flat config ships a legacy string-array
      // `plugins` field that ESLint's flat config rejects, so its rules are applied here
      // directly against the plugin object registered above instead of spreading that config.
      ...reactHooks.configs["recommended-latest"].rules,
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [reactRefresh.configs.vite],
  }
);
