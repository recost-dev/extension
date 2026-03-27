const CANONICAL_PROVIDER_ALIASES: Record<string, string> = {
  "open-ai": "openai",
  "open ai": "openai",
  "aws bedrock": "aws-bedrock",
  "aws_bedrock": "aws-bedrock",
  "vertex ai": "vertex-ai",
  "vertex_ai": "vertex-ai",
  "aws s3": "aws-s3",
  "aws_s3": "aws-s3",
  "aws api gateway": "aws-api-gateway",
  "aws_api_gateway": "aws-api-gateway",
  "aws lambda": "aws-lambda",
  "aws_lambda": "aws-lambda",
  "google maps": "google-maps",
  "google_maps": "google-maps",
  "x-ai": "xai",
};

const VALID_PROVIDER_IDS = new Set([
  "openai",
  "anthropic",
  "gemini",
  "cohere",
  "mistral",
  "stripe",
  "paypal",
  "aws",
  "aws-bedrock",
  "aws-s3",
  "aws-api-gateway",
  "aws-lambda",
  "vertex-ai",
  "supabase",
  "firebase",
  "firestore",
  "xai",
  "perplexity",
  "openrouter",
  "groq",
  "deepseek",
  "algolia",
  "segment",
  "github",
  "google-maps",
  "local-openai-compatible",
]);

const JUNK_PROVIDER_PATTERNS = [
  /^node:/,
  /^(fs|path|vscode|http)$/i,
  /assert/i,
  /(^|[-_/])(jest|vitest|mocha|chai|ava|tap|uvu|sinon|expect)([-_/]|$)/i,
];

function normalizeRawProvider(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, "-");
}

export function normalizeProviderId(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith(".") || trimmed.startsWith("/") || trimmed.startsWith("node:")) return null;
  if (/[/:]/.test(trimmed) && !/^https?:/i.test(trimmed)) return null;

  const normalized = normalizeRawProvider(trimmed);
  const canonical = CANONICAL_PROVIDER_ALIASES[normalized] ?? CANONICAL_PROVIDER_ALIASES[trimmed.toLowerCase()] ?? normalized;
  return canonical;
}

export function isRealProviderId(value: string | null | undefined): value is string {
  const normalized = normalizeProviderId(value);
  if (normalized === null) return false;
  if (JUNK_PROVIDER_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  return VALID_PROVIDER_IDS.has(normalized);
}

export function collectRealProviders(values: Array<string | null | undefined>): string[] {
  const providers = new Set<string>();
  for (const value of values) {
    const normalized = normalizeProviderId(value);
    if (normalized && isRealProviderId(normalized)) {
      providers.add(normalized);
    }
  }
  return [...providers].sort();
}

export function isRealProvider(value: string | null | undefined): value is string {
  return isRealProviderId(value);
}

export function filterRealProviders(values: Array<string | null | undefined>): string[] {
  return collectRealProviders(values);
}
