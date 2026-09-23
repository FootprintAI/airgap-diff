// @ts-check
const { defineConfig } = require("@playwright/test");
const path = require("node:path");

module.exports = defineConfig({
  testDir: "./e2e",
  use: {
    // No dev server: this is a static, zero-build page, so tests open it straight off disk the
    // same way a user opening index.html would.
    baseURL: "file://" + path.resolve(__dirname),
  },
  reporter: "list",
});
