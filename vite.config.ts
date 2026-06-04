import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { build, defineConfig } from "vite";

function buildContentScript() {
  return {
    name: "build-content-script",
    async closeBundle(): Promise<void> {
      await build({
        configFile: false,
        publicDir: false,
        build: {
          target: "chrome116",
          minify: "oxc",
          sourcemap: false,
          outDir: "dist",
          emptyOutDir: false,
          lib: {
            entry: resolve(import.meta.dirname, "src/content/index.ts"),
            name: "content",
            formats: ["iife"],
            fileName: () => "content.js",
          },
        },
      });
    },
  };
}

function buildBackgroundScript() {
  return {
    name: "build-background-script",
    async closeBundle(): Promise<void> {
      await build({
        configFile: false,
        publicDir: false,
        build: {
          target: "chrome116",
          minify: "oxc",
          sourcemap: false,
          outDir: "dist",
          emptyOutDir: false,
          lib: {
            entry: resolve(import.meta.dirname, "src/background/index.ts"),
            formats: ["es"],
            fileName: () => "background.js",
          },
          rollupOptions: {
            output: {
              codeSplitting: false,
            },
          },
        },
      });
    },
  };
}

function copyAssetsPlugin() {
  return {
    name: "copy-extension-assets",
    closeBundle(): void {
      copyFileSync("manifest.json", "dist/manifest.json");
      copyFileSync("THIRD_PARTY_NOTICES.md", "dist/THIRD_PARTY_NOTICES.md");
      for (const asset of [
        "icon-72x72.png",
        "icon-96x96.png",
        "icon-128x128.png",
        "logo-dark.svg",
        "logo-light.svg",
      ]) {
        copyFileSync(`public/${asset}`, `dist/${asset}`);
      }
      mkdirSync("dist/licenses", { recursive: true });
      const licenses: ReadonlyArray<readonly [string, string]> = [
        ["node_modules/@openrouter/sdk/LICENSE.md", "openrouter-sdk-Apache-2.0.txt"],
        ["node_modules/zod/LICENSE", "zod-MIT.txt"],
        ["node_modules/@fontsource-variable/inter/LICENSE", "inter-OFL-1.1.txt"],
      ];
      for (const [source, target] of licenses) {
        copyFileSync(source, `dist/licenses/${target}`);
      }
    },
  };
}

export default defineConfig({
  publicDir: false,
  plugins: [copyAssetsPlugin(), buildContentScript(), buildBackgroundScript()],
  build: {
    target: "chrome116",
    minify: "oxc",
    sourcemap: false,
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, "src/popup/index.html"),
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
