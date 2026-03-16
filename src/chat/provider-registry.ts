import type {
  ChatModelMetadata,
  ChatModelOption,
  ChatProviderAdapter,
  ChatProviderId,
  ChatProviderOption,
  ResolvedProviderAuth,
  SecretValueReader,
} from "./types";
import { ChatAdapterError } from "./errors";
import { anthropicAdapter } from "./providers/anthropic";
import { cohereAdapter } from "./providers/cohere";
import { ecoAdapter } from "./providers/eco";
import { geminiAdapter } from "./providers/gemini";
import { mistralAdapter } from "./providers/mistral";
import { openAiAdapter } from "./providers/openai";
import { perplexityAdapter } from "./providers/perplexity";
import { xAiAdapter } from "./providers/xai";

const providers: ChatProviderAdapter[] = [
  ecoAdapter,
  openAiAdapter,
  anthropicAdapter,
  geminiAdapter,
  xAiAdapter,
  cohereAdapter,
  mistralAdapter,
  perplexityAdapter,
];

export function listProviderAdapters(): ChatProviderAdapter[] {
  return providers.slice();
}

export function getProviderAdapter(providerId: string): ChatProviderAdapter {
  const provider = providers.find((entry) => entry.id === providerId);
  if (!provider) {
    throw new ChatAdapterError("unsupported_provider", `Unsupported chat provider: ${providerId}`);
  }
  return provider;
}

export function findModelMetadata(providerId: string, modelId: string): ChatModelMetadata | undefined {
  return getProviderAdapter(providerId).models.find((model) => model.id === modelId);
}

export function getDefaultChatSelection(): { provider: ChatProviderId; model: string } {
  return { provider: "eco", model: "eco-ai" };
}

export function buildProviderOptions(): ChatProviderOption[] {
  return providers.map((provider) => ({
    id: provider.id,
    displayName: provider.displayName,
    envKeyName: provider.auth.envKeyName,
    baseUrl: provider.baseUrl,
    defaultChatEndpoint: provider.defaultChatEndpoint,
    authHeaderFormat: provider.authHeaderFormat,
    supportsStreaming: provider.supportsStreaming,
    models: provider.models.map((model): ChatModelOption => ({
      id: model.id,
      displayName: model.displayName,
      providerId: provider.id,
      supportsStreaming: model.supportsStreaming ?? provider.supportsStreaming,
    })),
  }));
}

export async function resolveProviderAuth(
  providerId: string,
  secrets?: SecretValueReader
): Promise<ResolvedProviderAuth> {
  const provider = getProviderAdapter(providerId);
  if (!provider.auth.required) {
    return { source: "none" };
  }
  const envKeyName = provider.auth.envKeyName;
  if (envKeyName) {
    const envValue = process.env[envKeyName];
    if (envValue?.trim()) {
      return { apiKey: envValue.trim(), source: "env" };
    }
  }
  const secretKeys = [provider.auth.secretStorageKey];
  if (provider.id === "openai") {
    secretKeys.push("eco.openaiApiKey");
  }
  if (secrets) {
    for (const secretKey of secretKeys) {
      if (!secretKey) continue;
      const secretValue = await secrets.get(secretKey);
      if (secretValue?.trim()) {
        return { apiKey: secretValue.trim(), source: "secret" };
      }
    }
  }
  throw new ChatAdapterError(
    "missing_api_key",
    provider.auth.envKeyName
      ? `${provider.displayName} API key is missing. Set ${provider.auth.envKeyName} or save a key in the extension.`
      : `${provider.displayName} API key is missing.`,
    { provider: provider.id, envKeyName: provider.auth.envKeyName }
  );
}
