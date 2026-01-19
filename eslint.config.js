import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "**/node_modules/**",
      "**/output/**",
      "**/*.min.js",
    ],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      // エラー防止
      "no-undef": "error",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off", // CLIツールなのでconsoleは許可

      // コード品質
      "eqeqeq": ["error", "always"],
      "no-var": "error",
      "prefer-const": "warn",

      // セキュリティ
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
];
