"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.readWorkspaceFileExcerpt = readWorkspaceFileExcerpt;
exports.scanWorkspace = scanWorkspace;
exports.detectLocalWastePatterns = detectLocalWastePatterns;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const patterns_1 = require("./patterns");
const local_waste_detector_1 = require("./local-waste-detector");
const ast_scanner_1 = require("../ast/ast-scanner");
const parser_loader_1 = require("../ast/parser-loader");
const MAX_FILES = 5000;
const HTTP_CALL_HINT = /\b(fetch|axios|got|superagent|ky|requests|http\.|\$http|openai|responses|completions|embeddings|moderations|vector_stores|vectorStores|assistants|threads|realtime|uploads|batches|containers|skills|videos|evals|images|audio|files|models|anthropic|claude|gemini|genai|bedrock|vertex|cohere|mistral|stripe|graphql|apollo|urql|relay|supabase|firebase|trpc|grpc)\b/i;
const GENERIC_TEMPLATE_SEGMENT = /\$\{\s*(endpoint|url|path|uri|route)\s*\}/i;
const HARD_EXCLUDED_SEGMENTS = new Set([
    "node_modules",
    "docs",
    "examples",
    "dist",
    "build",
    "coverage",
    ".git",
    ".next",
    "vendor",
    "venv",
    ".venv",
    "__pycache__",
]);
function isGenericDynamicUrl(url) {
    const dynamic = url.match(/^<dynamic:([^>]+)>$/i);
    if (dynamic) {
        const token = dynamic[1].trim().toLowerCase();
        return ["endpoint", "url", "path", "uri", "route"].includes(token);
    }
    return false;
}
function isHighConfidenceUrl(url) {
    if (!url)
        return false;
    if (/^https?:\/\//i.test(url))
        return true;
    if (url.startsWith("/"))
        return true;
    if (GENERIC_TEMPLATE_SEGMENT.test(url))
        return false;
    if (/^<dynamic:/i.test(url)) {
        if (isGenericDynamicUrl(url))
            return false;
        const token = (url.match(/^<dynamic:([^>]+)>$/i)?.[1] ?? "").toLowerCase();
        // A lone base URL variable is not an endpoint route.
        if (/base[_-]?url/.test(token))
            return false;
        return true;
    }
    return false;
}
async function readUriText(uri) {
    const openDoc = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString());
    if (openDoc) {
        return openDoc.getText();
    }
    const content = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(content).toString("utf-8");
}
function parseCsvGlobs(value) {
    if (!value)
        return [];
    return value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}
function isHardExcludedPath(relativePath) {
    const normalized = relativePath.replace(/\\/g, "/");
    const segments = normalized.split("/");
    return segments.some((segment) => HARD_EXCLUDED_SEGMENTS.has(segment));
}
async function findScopedUris(config) {
    const includeGlob = config.get("scanGlob", "**/*.{ts,tsx,js,jsx,py,go,java,rb}");
    const scopedInclude = parseCsvGlobs(config.get("scanIncludeGlobs", ""));
    const configuredExclude = config.get("excludeGlob", "**/node_modules/**,**/dist/**,**/build/**,**/.git/**,**/.next/**,**/vendor/**");
    const hardExcludeGlob = "**/node_modules/**,**/docs/**,**/examples/**,**/dist/**,**/build/**,**/coverage/**,**/.git/**,**/.next/**,**/vendor/**,**/venv/**,**/.venv/**,**/__pycache__/**";
    const mergedExclude = configuredExclude ? `${configuredExclude},${hardExcludeGlob}` : hardExcludeGlob;
    const includePatterns = scopedInclude.length > 0 ? scopedInclude : [includeGlob];
    const uriByPath = new Map();
    for (const pattern of includePatterns) {
        const uris = await vscode.workspace.findFiles(pattern, mergedExclude, MAX_FILES);
        for (const uri of uris) {
            const relativePath = vscode.workspace.asRelativePath(uri, false);
            if (isHardExcludedPath(relativePath))
                continue;
            uriByPath.set(uri.toString(), uri);
        }
    }
    return Array.from(uriByPath.values());
}
async function readWorkspaceFileExcerpt(relativePath, options) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder)
        return null;
    try {
        const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, relativePath);
        const text = await readUriText(fileUri);
        const lines = text.split("\n");
        const context = Math.max(options?.contextLines ?? 30, 5);
        const center = options?.centerLine ? Math.max(1, options.centerLine) : 1;
        const startLine = Math.max(1, center - context);
        const endLine = Math.min(lines.length, center + context);
        const selected = lines.slice(startLine - 1, endLine);
        let content = selected.join("\n");
        const maxChars = Math.max(options?.maxChars ?? 6000, 500);
        if (content.length > maxChars) {
            content = `${content.slice(0, maxChars)}\n/* ...truncated... */`;
        }
        return { content, startLine, endLine };
    }
    catch {
        return null;
    }
}
function astMatchToApiCallInput(match, file) {
    const method = match.method ?? "CALL";
    const url = match.endpoint ??
        (match.provider
            ? `sdk://${match.provider}/${match.methodChain}`
            : `ast:${match.methodChain}`);
    const library = match.packageName ?? match.provider ?? match.methodChain.split(".")[0];
    const isHighFreq = match.isMiddleware ||
        match.frequency === "unbounded-loop" ||
        match.frequency === "polling" ||
        match.frequency === "parallel" ||
        match.frequency === "bounded-loop";
    const frequency = isHighFreq ? "per-request" : "daily";
    return { file, line: match.line, method, url, library, frequency };
}
async function scanWorkspace(onProgress) {
    const config = vscode.workspace.getConfiguration("recost");
    const uris = await findScopedUris(config);
    const allCalls = [];
    const dedupe = new Set();
    const uniqueEndpointKeys = new Set();
    for (let i = 0; i < uris.length; i++) {
        const uri = uris[i];
        const relativePath = vscode.workspace.asRelativePath(uri, false);
        try {
            const text = await readUriText(uri);
            const lines = text.split("\n");
            // ── AST scan (JS/TS only) ──────────────────────────────────────────────
            const astCoveredLines = new Set();
            const ext = path.extname(relativePath);
            if ((0, parser_loader_1.getLanguageForExtension)(ext)) {
                try {
                    const absPath = uri.fsPath;
                    const fileReader = async (fp) => {
                        if (fp === absPath)
                            return text;
                        try {
                            return await readUriText(vscode.Uri.file(fp));
                        }
                        catch {
                            return null;
                        }
                    };
                    const astResult = await (0, ast_scanner_1.scanFileWithAst)(absPath, fileReader);
                    for (const match of astResult.matches) {
                        const apiCall = astMatchToApiCallInput(match, relativePath);
                        const key = `${relativePath}:${match.line}:${apiCall.method}:${apiCall.url}`;
                        if (dedupe.has(key))
                            continue;
                        dedupe.add(key);
                        astCoveredLines.add(match.line);
                        uniqueEndpointKeys.add(`${apiCall.method} ${apiCall.url}`);
                        allCalls.push(apiCall);
                    }
                }
                catch {
                    // AST failed — fall through to regex-only for this file
                }
            }
            // ── Regex scan ────────────────────────────────────────────────────────
            for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                const lineNum = lineIndex + 1;
                if (astCoveredLines.has(lineNum))
                    continue;
                const line = lines[lineIndex];
                const routeMatches = (0, patterns_1.matchRouteDefinitionLine)(line);
                for (const route of routeMatches) {
                    if (!isHighConfidenceUrl(route.url))
                        continue;
                    const key = `${relativePath}:${lineIndex + 1}:${route.method}:${route.url}:${route.library}`;
                    if (dedupe.has(key))
                        continue;
                    dedupe.add(key);
                    uniqueEndpointKeys.add(`${route.method} ${route.url}`);
                    allCalls.push({
                        file: relativePath,
                        line: lineIndex + 1,
                        method: route.method,
                        url: route.url,
                        library: route.library,
                        frequency: "daily",
                    });
                }
                let matches = (0, patterns_1.matchLine)(line);
                if (matches.length === 0 && HTTP_CALL_HINT.test(line)) {
                    const multiLine = lines.slice(lineIndex, Math.min(lines.length, lineIndex + 6)).join("\n");
                    matches = (0, patterns_1.matchLine)(multiLine);
                }
                for (const match of matches) {
                    if (!isHighConfidenceUrl(match.url))
                        continue;
                    const key = `${relativePath}:${lineIndex + 1}:${match.method}:${match.url}:${match.library}`;
                    if (dedupe.has(key))
                        continue;
                    dedupe.add(key);
                    uniqueEndpointKeys.add(`${match.method} ${match.url}`);
                    const inLoop = (0, patterns_1.isInsideLoop)(lines, lineIndex);
                    allCalls.push({
                        file: relativePath,
                        line: lineIndex + 1,
                        method: match.method,
                        url: match.url,
                        library: match.library,
                        frequency: inLoop ? "per-request" : "daily",
                    });
                }
            }
        }
        catch {
            // Skip files that can't be read
        }
        onProgress?.({
            file: relativePath,
            index: i,
            total: uris.length,
            endpointsSoFar: uniqueEndpointKeys.size,
        });
    }
    return allCalls;
}
async function detectLocalWastePatterns() {
    const config = vscode.workspace.getConfiguration("recost");
    const uris = await findScopedUris(config);
    const findings = [];
    for (const uri of uris) {
        try {
            const relativePath = vscode.workspace.asRelativePath(uri, false);
            const text = await readUriText(uri);
            findings.push(...(0, local_waste_detector_1.detectLocalWasteFindingsInText)(relativePath, text));
        }
        catch {
            // Skip files that can't be read
        }
    }
    return findings;
}
//# sourceMappingURL=workspace-scanner.js.map