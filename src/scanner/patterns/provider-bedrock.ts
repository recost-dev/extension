import { ApiCallMatch, LineMatcher } from "./types";

const COMMAND_MAP: Record<string, { action: string; endpoint: string; method: string; streaming?: boolean }> = {
  InvokeModelCommand: {
    action: "invoke_model",
    endpoint: "https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/invoke",
    method: "POST",
  },
  ConverseCommand: {
    action: "converse",
    endpoint: "https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/converse",
    method: "POST",
  },
  ConverseStreamCommand: {
    action: "converse_stream",
    endpoint: "https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/converse-stream",
    method: "POST",
    streaming: true,
  },
};

export const bedrockMatcher: LineMatcher = {
  name: "provider-bedrock",
  matchLine(line: string): ApiCallMatch[] {
    const matches: ApiCallMatch[] = [];

    const jsRegex = /\.send\(\s*new\s+(InvokeModelCommand|ConverseCommand|ConverseStreamCommand)\s*\(/gi;
    let jsMatch: RegExpExecArray | null;
    while ((jsMatch = jsRegex.exec(line)) !== null) {
      const command = jsMatch[1];
      const mapped = COMMAND_MAP[command];

      matches.push({
        kind: "sdk",
        provider: "aws-bedrock",
        sdk: "aws-sdk-bedrock-runtime",
        method: mapped.method,
        endpoint: mapped.endpoint,
        resource: "model/{modelId}",
        action: mapped.action,
        streaming: mapped.streaming,
        batchCapable: false,
        cacheCapable: true,
        rawMatch: jsMatch[0],
      });
    }

    const botoRegex = /\b(?:bedrock|client|runtime_client)\.(invoke_model|converse|converse_stream)\s*\(/gi;
    let botoMatch: RegExpExecArray | null;
    while ((botoMatch = botoRegex.exec(line)) !== null) {
      const action = botoMatch[1].toLowerCase();
      const endpoint =
        action === "invoke_model"
          ? "https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/invoke"
          : action === "converse"
            ? "https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/converse"
            : "https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/converse-stream";

      matches.push({
        kind: "sdk",
        provider: "aws-bedrock",
        sdk: "boto3-bedrock-runtime",
        method: "POST",
        endpoint,
        resource: "model/{modelId}",
        action,
        streaming: action === "converse_stream",
        cacheCapable: true,
        rawMatch: botoMatch[0],
      });
    }

    return matches;
  },
};
