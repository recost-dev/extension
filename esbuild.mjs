import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";

const watch = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: {
    extension: "src/extension.ts",
    "cli/scan": "src/cli/scan.ts",
  },
  bundle: true,
  outdir: "dist",
  external: ["vscode", "web-tree-sitter"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  minify: false,
};

// Copy web-tree-sitter into dist/node_modules so it is resolvable from dist/extension.js
// when the extension runs without a top-level node_modules (i.e. installed from VSIX).
function copyWebTreeSitter() {
  const src = path.resolve("node_modules/web-tree-sitter");
  const dst = path.resolve("dist/node_modules/web-tree-sitter");
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}

function copyParserAssets() {
  const src = path.resolve("assets/parsers");
  const dst = path.resolve("dist/assets/parsers");
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  copyWebTreeSitter();
  copyParserAssets();
  console.log("Watching for changes...");
} else {
  await esbuild.build(buildOptions);
  copyWebTreeSitter();
  copyParserAssets();
  console.log("Extension built successfully.");
}
