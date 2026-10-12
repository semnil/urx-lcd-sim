import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
    // The embedded glass reads its stylesheets as text (src/embed.ts, src/embed-css.test.ts); vitest
    // hands any other stylesheet over empty.
    css: { include: [/\.css\?(raw|inline)$/] },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
});
