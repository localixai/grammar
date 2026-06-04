import { access, readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");

async function json(path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

const [manifest, packageJson, lock, builtManifest] = await Promise.all([
  json("manifest.json"),
  json("package.json"),
  json("package-lock.json"),
  json("dist/manifest.json"),
]);

invariant(manifest.manifest_version === 3, "manifest.json must use Manifest V3");
invariant(manifest.version === packageJson.version, "manifest and package versions differ");
invariant(lock.packages?.[""]?.version === packageJson.version, "package-lock version differs");
invariant(builtManifest.version === manifest.version, "dist manifest version is stale");
invariant(manifest.background?.type === "module", "background service worker must be an ES module");
invariant(
  manifest.content_security_policy?.extension_pages ===
    "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src https://openrouter.ai; object-src 'none'",
  "extension CSP must allow network connections only to OpenRouter",
);
invariant(
  Number.parseInt(manifest.minimum_chrome_version, 10) >= 116,
  "minimum Chrome version must support the extension runtime",
);
invariant(manifest.permissions.includes("storage"), "storage permission is required");
invariant(manifest.permissions.includes("identity"), "identity permission is required");
invariant(!manifest.permissions.includes("tabs"), "tabs permission is intentionally not allowed");
invariant(
  JSON.stringify([...manifest.host_permissions].sort()) ===
    JSON.stringify(["http://*/*", "https://*/*"]),
  "host access must be limited to HTTP(S) pages",
);
invariant(
  manifest.content_scripts?.every((script) => script.all_frames === true),
  "all content scripts must explicitly support frames",
);
invariant(
  packageJson.dependencies?.["@openrouter/sdk"] === "1.2.2",
  "the official OpenRouter SDK must remain exactly pinned",
);
invariant(
  packageJson.dependencies?.["@earendil-works/pi-ai"] === undefined,
  "pi-ai is intentionally absent for the single grammar-completion use case",
);
invariant(
  !JSON.stringify(lock).includes("@earendil-works/pi"),
  "the lockfile must not retain pi runtime packages",
);

const sdkBoundaryFiles = [
  "src/background/grammar-service.ts",
  "src/background/models-service.ts",
  "src/shared/utils/openrouter-auth.ts",
];
const sdkBoundarySources = await Promise.all(
  sdkBoundaryFiles.map((path) => readFile(resolve(root, path), "utf8")),
);
invariant(
  sdkBoundarySources.every((source) => source.includes("@openrouter/sdk/")),
  "chat, catalog, and OAuth boundaries must use official OpenRouter SDK operations",
);
invariant(
  sdkBoundarySources.every((source) => !/\bfetch\s*\(/u.test(source)),
  "do not reintroduce a raw OpenRouter fetch client beside the official SDK",
);

const referenced = new Set([
  manifest.background.service_worker,
  manifest.action.default_popup,
  ...manifest.content_scripts.flatMap((script) => script.js),
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
  "THIRD_PARTY_NOTICES.md",
  "licenses/openrouter-sdk-Apache-2.0.txt",
  "licenses/zod-MIT.txt",
  "licenses/inter-OFL-1.1.txt",
]);
await Promise.all(
  [...referenced].map(async (path) => {
    await access(resolve(dist, path));
  }),
);

const files = await walk(dist);
const relativeFiles = files.map((path) => path.slice(dist.length + 1));
const backgroundSource = await readFile(resolve(dist, manifest.background.service_worker), "utf8");
const dynamicImportTokens = backgroundSource.match(/\bimport\(/gu) ?? [];
const logoBytes = await Promise.all(
  ["logo-dark.svg", "logo-light.svg"].map(async (path) => (await stat(resolve(dist, path))).size),
);
invariant(
  logoBytes.every((size) => size < 60_000),
  "optimized Localix logo variants must remain below 60 KB each",
);
const forbidden = relativeFiles.filter(
  (path) =>
    path.endsWith(".map") ||
    path.endsWith(".ts") ||
    path.includes("test-results") ||
    path.startsWith("public/") ||
    [
      "bird.svg",
      "icon-144x144.png",
      "icon-152x152.png",
      "icon-192x192.png",
      "icon-384x384.png",
      "icon-512x512.png",
      "icon-adaptive.png",
    ].includes(path),
);
invariant(forbidden.length === 0, `Unexpected development artifacts: ${forbidden.join(", ")}`);
invariant(
  !relativeFiles.some((path) => /inter-(?:cyrillic|greek|vietnamese)-/u.test(path)),
  "English-only popup must not ship unused Inter script subsets",
);
invariant(
  !relativeFiles.some((path) => /^chatSend-|^modelsList-/u.test(path)),
  "OpenRouter SDK operations must be bundled into the service worker",
);
invariant(
  dynamicImportTokens.length === 0 &&
    !backgroundSource.includes("node:") &&
    !/\brequire\s*\(/u.test(backgroundSource) &&
    !/\beval\s*\(/u.test(backgroundSource),
  "MV3 background must not retain dynamic imports, Node built-ins, or runtime code evaluation",
);

const totalBytes = (await Promise.all(files.map(async (path) => (await stat(path)).size))).reduce(
  (sum, size) => sum + size,
  0,
);
invariant(totalBytes < 2_500_000, `Unpacked extension is unexpectedly large: ${totalBytes} bytes`);

console.log(
  `Validated Localix Grammar ${manifest.version}: ${relativeFiles.length} files, ${totalBytes} bytes.`,
);
