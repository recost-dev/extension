export type {
  CostModel,
  Language,
  MethodFingerprint,
  HostPattern,
  ProviderFingerprint,
} from "./types";
import type { ProviderFingerprint } from "./types";

import openai from "./openai.json";
import anthropic from "./anthropic.json";
import stripe from "./stripe.json";
import supabase from "./supabase.json";
import firebase from "./firebase.json";
import bedrock from "./bedrock.json";
import gemini from "./gemini.json";
import cohere from "./cohere.json";
import mistral from "./mistral.json";
import vertex from "./vertex.json";

// Host-mapping providers (no methods — used only for host → provider resolution)
import freeApis from "./free-apis.json";
import messaging from "./messaging.json";
import awsExtended from "./aws-extended.json";
import googleApis from "./google-apis.json";
import paymentsExtended from "./payments-extended.json";
import identity from "./identity.json";
import crm from "./crm.json";
import analytics from "./analytics.json";
import databasesExtended from "./databases-extended.json";
import search from "./search.json";
import infra from "./infra.json";
import media from "./media.json";
import shipping from "./shipping.json";
import openaiCompatibleProviders from "./openai-compatible-providers.json";

export {
  openai,
  anthropic,
  stripe,
  supabase,
  firebase,
  bedrock,
  gemini,
  cohere,
  mistral,
  vertex,
};

/** Core AI / billing providers — have methods, pricing, and language support */
export const ALL_PROVIDERS: ProviderFingerprint[] = [
  openai,
  anthropic,
  stripe,
  supabase,
  firebase,
  bedrock,
  gemini,
  cohere,
  mistral,
  vertex,
] as ProviderFingerprint[];

/** Host-only mapping providers — used solely to resolve hostname → provider id */
export const HOST_MAP_PROVIDERS: ProviderFingerprint[] = [
  freeApis,
  messaging,
  awsExtended,
  googleApis,
  paymentsExtended,
  identity,
  crm,
  analytics,
  databasesExtended,
  search,
  infra,
  media,
  shipping,
  openaiCompatibleProviders,
] as ProviderFingerprint[];

/** Package names that should never be treated as external API providers. */
export const STDLIB_DENYLIST = new Set([
  // Node stdlib
  "path", "fs", "fs/promises", "os", "http", "https", "assert", "assert/strict",
  "node:path", "node:fs", "node:os", "node:assert", "node:http",
  // Test frameworks
  "vitest", "jest", "mocha", "chai",
  // UI/frontend frameworks
  "react", "react-dom", "vue", "svelte",
  // Backend frameworks
  "hono", "express", "fastify", "koa",
  // VS Code
  "vscode",
  // Build tools
  "vite", "esbuild", "rollup",
  // Visualization
  "d3",
  // Sanitization/markdown
  "dompurify", "marked",
  // Internal path aliases — secondary safety net (primary filter is isInternalImport in ast-scanner.ts)
  "@/src/lib/api-client",
  "@/app/lib/api-client",
  "./parser-loader",
  "./types",
  "./analysis/types",
  "../scanner/local-waste-detector",
  "../scanner/fingerprints/index",
  "../scanner/fingerprints/types",
  "../ast/ast-scanner",
  "../types",
  "./index",
]);
