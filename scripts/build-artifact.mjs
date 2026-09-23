// Bundles the app into one self-contained HTML page for publishing as a claude.ai Artifact.
// The artifact talks to Claude through the viewer (no server, no API key).
import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist", "korean-natural-writer.html");

const swapApi = {
  name: "swap-api",
  setup(b) {
    b.onResolve({ filter: /^\.\/api\.js$/ }, (args) =>
      args.importer.includes(`${path.sep}public${path.sep}js${path.sep}`)
        ? { path: path.join(root, "artifact", "api.js") }
        : undefined);
  },
};

const result = await build({
  entryPoints: [path.join(root, "public/js/app.js")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  write: false,
  plugins: [swapApi],
  logLevel: "warning",
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

const html = await fs.readFile(path.join(root, "public/index.html"), "utf8");
const css = (await fs.readFile(path.join(root, "public/css/app.css"), "utf8"))
  .replace('font-family: "Pretendard Variable", Pretendard,', 'font-family: "Pretendard Variable", Pretendard, "Noto Sans KR",');
const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"))
  .replace(/<script type="module"[^>]*><\/script>/, "");

// The artifact skeleton supplies <html>/<head>/<body>; write content directly.
const page = `<title>Korean Natural Writer</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap">
<style>
${css}
body { padding-inline: 0; }
.topbar { top: env(safe-area-inset-top, 0px); }
</style>
${body.trim()}
<script>
${js}
</script>
`;
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, page);
console.log(`wrote ${path.relative(root, out)} (${(page.length / 1024).toFixed(0)} KiB)`);
