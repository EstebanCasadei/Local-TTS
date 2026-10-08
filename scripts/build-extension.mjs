import { build } from "vite";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const packageRoot = (name) => resolve("node_modules", name);
await build({ configFile: "vite.extension.config.ts", mode: "extension" });
// A content script must be self-contained: it cannot import extension modules.
await build({
  configFile: false,
  mode: "extension",
  publicDir: false,
  build: {
    outDir: "dist-extension",
    emptyOutDir: false,
    lib: {
      entry: "src/extension/content.ts",
      formats: ["iife"],
      name: "LocalTtsContent",
      fileName: () => "content.js",
    },
  },
});
const output = "dist-extension";
await mkdir(join(output, "runtime"), { recursive: true });
await mkdir(join(output, "icons"), { recursive: true });
await cp("extension/manifest.json", join(output, "manifest.json"));
for (const size of [16, 32, 48, 128]) {
  await cp(
    size === 16
      ? "public/favicon-16x16.png"
      : size === 32
        ? "public/favicon-32x32.png"
        : "public/android-chrome-192x192.png",
    join(output, "icons", size + ".png"),
  );
}
await cp("public/voices", join(output, "voices"), { recursive: true });
const ort = packageRoot("onnxruntime-web");
const piper = packageRoot("@diffusionstudio/piper-wasm");
for (const name of ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
  await cp(join(ort, "dist", name), join(output, "runtime", name));
}
for (const name of ["piper_phonemize.wasm", "piper_phonemize.data"]) {
  await cp(join(piper, "build", name), join(output, "runtime", name));
}
// Preserve notices with the redistributable runtime assets.
for (const [name, path] of [
  ["onnxruntime-web", ort],
  ["piper-wasm", piper],
]) {
  const metadata = JSON.parse(await readFile(join(path, "package.json"), "utf8"));
  const notices = (await readdir(path)).filter((file) => /^(license|notice|copying)/i.test(file));
  await mkdir(join(output, "licenses", name), { recursive: true });
  for (const file of notices) await cp(join(path, file), join(output, "licenses", name, file));
  await writeFile(
    join(output, "licenses", name, "package.json"),
    JSON.stringify(
      {
        name: metadata.name,
        version: metadata.version,
        license: metadata.license,
        repository: metadata.repository,
      },
      null,
      2,
    ),
  );
}
await cp("extension/THIRD_PARTY_NOTICES.md", join(output, "THIRD_PARTY_NOTICES.md"));
