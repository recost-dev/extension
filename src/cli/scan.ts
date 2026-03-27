import * as path from "path";
import { createFilesystemScanAccess } from "./filesystem-adapter";
import { detectLocalWastePatternsInFiles, scanFiles } from "../scanner/core-scanner";
import { createProject, getAllEndpoints, getAllSuggestions, submitScan } from "../api-client";
import { buildLocalScanResults, buildRemoteScanResults, shouldSubmitRemote, type FinalScanResults } from "../scan-results";

interface CliOptions {
  target: string;
  format: "json" | "summary";
}

interface CliResult {
  target: string;
  scannedFileCount: number;
  mode: "local-only" | "remote-enriched";
  projectId: string;
  scanId: string;
  local: {
    apiCalls: Awaited<ReturnType<typeof scanFiles>>;
    localWasteFindings: Awaited<ReturnType<typeof detectLocalWastePatternsInFiles>>;
    submittedRemoteApiCalls: Awaited<ReturnType<typeof scanFiles>>;
  };
  remote: null | {
    projectId: string;
    scanId: string;
    endpoints: FinalScanResults["endpoints"];
    suggestions: FinalScanResults["suggestions"];
    summary: FinalScanResults["summary"];
  };
  final: {
    endpoints: FinalScanResults["endpoints"];
    suggestions: FinalScanResults["suggestions"];
    summary: FinalScanResults["summary"];
  };
  endpoints: FinalScanResults["endpoints"];
  suggestions: FinalScanResults["suggestions"];
  summary: FinalScanResults["summary"];
}

function printHelp(): void {
  process.stdout.write(
    [
      "Usage: node dist/cli/scan.js <file-or-directory> [--format json|summary]",
      "",
      "Examples:",
      "  node dist/cli/scan.js src",
      "  node dist/cli/scan.js src/scanner/workspace-scanner.ts --format summary",
      "",
    ].join("\n")
  );
}

function parseArgs(argv: string[]): CliOptions | null {
  const args = [...argv];
  let target = "";
  let format: CliOptions["format"] = "json";

  while (args.length > 0) {
    const arg = args.shift();
    if (!arg) continue;
    if (arg === "--help" || arg === "-h") return null;
    if (arg === "--format") {
      const value = args.shift();
      if (value === "json" || value === "summary") {
        format = value;
        continue;
      }
      throw new Error(`Unsupported format: ${value ?? "(missing value)"}`);
    }
    if (!target) {
      target = arg;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (!target) return null;
  return { target, format };
}

function writeSummary(result: CliResult): void {
  const lines = [
    `Target: ${result.target}`,
    `Files scanned: ${result.scannedFileCount}`,
    `Mode: ${result.mode}`,
    `Endpoints found: ${result.summary.totalEndpoints}`,
    `Issues found: ${result.suggestions.length}`,
    `Monthly cost: $${result.summary.totalMonthlyCost.toFixed(2)}`,
    `High-risk issues: ${result.summary.highRiskCount}`,
    "",
  ];

  if (result.endpoints.length > 0) {
    lines.push("Endpoints:");
    for (const endpoint of result.endpoints) {
      lines.push(`- ${endpoint.method} ${endpoint.url} (${endpoint.files.join(", ")})`);
    }
    lines.push("");
  }

  if (result.suggestions.length > 0) {
    lines.push("Issues:");
    for (const suggestion of result.suggestions) {
      lines.push(`- ${suggestion.type} ${suggestion.description}`);
    }
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

function resolveRcApiKey(): string | undefined {
  return process.env.RECOST_API_KEY?.trim() || process.env.RC_API_KEY?.trim();
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  const access = await createFilesystemScanAccess(options.target);
  const apiCalls = await scanFiles(access, (progress) => {
    process.stderr.write(`Scanning ${progress.file} (${progress.fileIndex}/${progress.fileTotal})\n`);
  });
  const localWasteFindings = await detectLocalWastePatternsInFiles(access);
  let mode: CliResult["mode"] = "local-only";
  let projectId = "local";
  let scanId = `local-${Date.now()}`;
  let finalResults = buildLocalScanResults(apiCalls, localWasteFindings, projectId, scanId);

  const rcApiKey = resolveRcApiKey();
  const remoteApiCalls = apiCalls.filter(shouldSubmitRemote);
  let remoteResult: CliResult["remote"] = null;
  if (rcApiKey && remoteApiCalls.length > 0) {
    try {
      projectId = await createProject(path.basename(path.resolve(options.target)), rcApiKey);
      const remoteScan = await submitScan(projectId, remoteApiCalls, rcApiKey);
      scanId = remoteScan.scanId;
      const [remoteEndpoints, remoteSuggestions] = await Promise.all([
        getAllEndpoints(projectId, scanId, rcApiKey),
        getAllSuggestions(projectId, scanId, rcApiKey),
      ]);
      finalResults = buildRemoteScanResults(
        remoteEndpoints,
        remoteSuggestions,
        remoteScan.summary,
        apiCalls,
        localWasteFindings,
        projectId,
        scanId
      );
      remoteResult = {
        projectId,
        scanId,
        endpoints: remoteEndpoints,
        suggestions: remoteSuggestions,
        summary: remoteScan.summary,
      };
      mode = "remote-enriched";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Remote enrichment unavailable: ${message}. Falling back to local-only results.\n`);
    }
  }

  const result: CliResult = {
    target: path.resolve(options.target),
    scannedFileCount: access.files.length,
    mode,
    projectId,
    scanId,
    local: {
      apiCalls,
      localWasteFindings,
      submittedRemoteApiCalls: remoteApiCalls,
    },
    remote: remoteResult,
    final: {
      endpoints: finalResults.endpoints,
      suggestions: finalResults.suggestions,
      summary: finalResults.summary,
    },
    endpoints: finalResults.endpoints,
    suggestions: finalResults.suggestions,
    summary: finalResults.summary,
  };

  if (options.format === "summary") {
    writeSummary(result);
    return;
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
