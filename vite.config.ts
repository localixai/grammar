import { defineConfig, build } from "vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync } from "fs";

function buildContentScript() {
  return {
    name: "build-content-script",
    async closeBundle() {
      await build({
        configFile: false,
        build: {
          target: "es2020",
          minify: false,
          sourcemap: true,
          outDir: "dist",
          emptyOutDir: false,
          lib: {
            entry: resolve(__dirname, "src/content/index.ts"),
            name: "content",
            formats: ["iife"],
            fileName: () => "content.js",
          },
          rollupOptions: {
            output: { inlineDynamicImports: true },
          },
        },
      });
    },
  };
}

function buildBackgroundScript() {
  return {
    name: "build-background-script",
    async closeBundle() {
      await build({
        configFile: false,
        build: {
          target: "es2020",
          minify: false,
          sourcemap: true,
          outDir: "dist",
          emptyOutDir: false,
          lib: {
            entry: resolve(__dirname, "src/background/index.ts"),
            name: "background",
            formats: ["iife"],
            fileName: () => "background.js",
          },
          rollupOptions: {
            output: { inlineDynamicImports: true },
          },
        },
      });
    },
  };
}

function copyAssetsPlugin() {
  return {
    name: "copy-assets",
    closeBundle() {
      mkdirSync("dist/public", { recursive: true });
      copyFileSync("manifest.json", "dist/manifest.json");
      const filesToCopy = [
        "logo-light.svg",
        "logo-dark.svg",
        "icon-72x72.png",
        "icon-96x96.png",
        "icon-128x128.png",
        "icon-192x192.png",
        "icon-512x512.png",
      ];
      for (const file of filesToCopy) {
        copyFileSync(`public/${file}`, `dist/public/${file}`);
      }
    },
  };
}

export default defineConfig({
  plugins: [copyAssetsPlugin(), buildContentScript(), buildBackgroundScript()],
  build: {
    target: "es2020",
    minify: false,
    sourcemap: true,
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/index.html"),
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
