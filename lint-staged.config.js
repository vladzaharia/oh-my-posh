export default {
    "src/**/*.ts": [
      "prettier --write",
      "eslint --fix"
    ],
    "config/**/*.{yml,yaml}": [
      "prettier --write"
    ],
    "*.{ts,yml,yaml}": () => "yarn build"
}