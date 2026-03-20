import { ChatAdapterError } from "../errors";
import type { ChatProviderAdapter, HttpErrorContext } from "../types";
import { openAiAdapter } from "./openai";

export const xAiAdapter: ChatProviderAdapter = {
  ...openAiAdapter,
  id: "xai",
  displayName: "xAI (Grok)",
  baseUrl: "https://api.x.ai",
  auth: {
    envKeyName: "XAI_API_KEY",
    secretStorageKey: "eco.providerApiKey.xai",
    required: true,
  },
  models: [
    { id: "grok-2-latest", displayName: "Grok 2", provider: "xai", supportsStreaming: true },
    { id: "grok-2-vision-latest", displayName: "Grok 2 Vision", provider: "xai", supportsStreaming: true },
    { id: "grok-beta", displayName: "Grok Beta", provider: "xai", supportsStreaming: true },
  ],
  validateRequest(request) {
    if (!xAiAdapter.models.some((model) => model.id === request.model)) {
      throw new ChatAdapterError("unsupported_model", `Unsupported xAI model: ${request.model}`, { provider: "xai" });
    }
  },
  toRequestBody(request, apiKey) {
    xAiAdapter.validateRequest(request);
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
    };
    if (typeof request.temperature === "number") body.temperature = request.temperature;
    if (typeof request.maxTokens === "number") body.max_tokens = request.maxTokens;
    if (request.stream) body.stream = true;
    return {
      url: `${xAiAdapter.baseUrl}${xAiAdapter.defaultChatEndpoint}`,
      headers: {
        "Content-Type": "application/json",
        ...xAiAdapter.authHeaders(apiKey ?? ""),
      },
      body,
    };
  },
  mapHttpError(context: HttpErrorContext) {
    if (context.status === 401 || context.status === 403) {
      return new ChatAdapterError("bad_auth", "xAI authentication failed. Check XAI_API_KEY or saved credentials.", { provider: "xai", status: context.status });
    }
    if (context.status === 429) {
      return new ChatAdapterError("rate_limited", "xAI rate limit reached. Wait and try again.", { provider: "xai", status: context.status });
    }
    return new ChatAdapterError("provider_error", `xAI request failed: ${context.bodyText || "Unknown error"}`, { provider: "xai", status: context.status });
  },
};
