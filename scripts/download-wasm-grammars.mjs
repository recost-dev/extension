/**
 * Downloads tree-sitter grammar WASM files for JavaScript and TypeScript.
 *
 * Run with:  node scripts/download-wasm-grammars.mjs
 *
 * Files are stored in assets/parsers/ so tests and the packaged extension
 * both work without network access at runtime.
 */
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import https from "https";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DEST = path.join(ROOT, "assets", "parsers");
fs.mkdirSync(DEST, { recursive: true });

// Copy the web-tree-sitter runtime WASM to assets/parsers so parser-loader
// can locate it from a single known directory in all environments.
const runtimeSrc = path.join(ROOT, "node_modules", "web-tree-sitter", "web-tree-sitter.wasm");
const runtimeDst = path.join(DEST, "web-tree-sitter.wasm");
if (!fs.existsSync(runtimeDst)) {
  fs.copyFileSync(runtimeSrc, runtimeDst);
  console.log("Copied web-tree-sitter.wasm");
} else {
  console.log("web-tree-sitter.wasm already present");
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest + ".tmp");
    const get = (u) => {
      https
        .get(u, { headers: { "User-Agent": "recost-setup" } }, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            res.resume();
            get(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) {
            file.close();
            fs.unlinkSync(dest + ".tmp");
            reject(new Error(`HTTP ${res.statusCode} downloading ${path.basename(dest)}`));
            return;
          }
          res.pipe(file);
          file.on("finish", () => {
            file.close(() => {
              fs.renameSync(dest + ".tmp", dest);
              const size = fs.statSync(dest).size;
              console.log(`  OK  ${path.basename(dest)} (${(size / 1024).toFixed(0)} KB)`);
              resolve();
            });
          });
        })
        .on("error", (err) => {
          file.close();
          if (fs.existsSync(dest + ".tmp")) fs.unlinkSync(dest + ".tmp");
          reject(err);
        });
    };
    get(url);
  });
}

const grammars = [
  {
    file: "tree-sitter-javascript.wasm",
    // tree-sitter-javascript v0.23.1 — built with tree-sitter 0.23.x (ABI 14)
    url: "https://github.com/tree-sitter/tree-sitter-javascript/releases/download/v0.23.1/tree-sitter-javascript.wasm",
  },
  {
    file: "tree-sitter-typescript.wasm",
    // tree-sitter-typescript v0.23.2 — built with tree-sitter 0.23.x (ABI 14)
    url: "https://github.com/tree-sitter/tree-sitter-typescript/releases/download/v0.23.2/tree-sitter-typescript.wasm",
  },
];

for (const { file, url } of grammars) {
  const dest = path.join(DEST, file);
  if (fs.existsSync(dest)) {
    console.log(`Already present: ${file}`);
    continue;
  }
  console.log(`Downloading ${file} ...`);
  await downloadFile(url, dest);
}

console.log("\nGrammar files ready in assets/parsers/");
