import next from "eslint-config-next";

export default [
  ...next,
  {
    ignores: ["**/.next/**", "**/dist/**", "**/coverage/**", "**/reports/**", "**/node_modules/**"]
  }
];
