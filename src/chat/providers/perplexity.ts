import { ChatAdapterError } from "../errors";
import type { ChatProviderAdapter, HttpErrorContext } from "../types";
import { openAiAdapter } from "./openai";

export const perplexityAdapter: ChatProviderAdapter = {
  ...openAiAdapter,
  id: "perplexity",
  displayName: "Perplexity",
  baseUrl: "https://api.perplexity.ai",
  defaultChatEndpoint: "/chat/completions",
  auth: {
    envKeyName: "PERPLEXITY_API_KEY",
    secretStorageKey: "eco.providerApiKey.perplexity",
    required: true,
  },
  models: [
    { id: "sonar", displayName: "Sonar", provider: "perplexity", supportsStreaming: true },
    { id: "sonar-pro", displayName: "Sonar Pro", provider: "perplexity", supportsStreaming: true },
    { id: "sonar-reasoning", displayName: "Sonar Reasoning", provider: "perplexity", supportsStreaming: true },
  ],
  validateRequest(request) {
    if (!perplexityAdapter.models.some((model) => model.id === request.model)) {
      throw new ChatAdapterError("unsupported_model", `Unsupported Perplexity model: ${request.model}`, { provider: "perplexity" });
    }
  },
  toRequestBody(request, apiKey) {
    perplexityAdapter.validateRequest(request);
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
    };
    if (typeof request.temperature === "number") body.temperature = request.temperature;
    if (typeof request.maxTokens === "number") body.max_tokens = request.maxTokens;
    if (request.stream) body.stream = true;
    return {
      url: `${perplexityAdapter.baseUrl}${perplexityAdapter.defaultChatEndpoint}`,
      headers: {
        "Content-Type": "application/json",
        ...perplexityAdapter.authHeaders(apiKey ?? ""),
      },
      body,
    };
  },
  mapHttpError(context: HttpErrorContext) {
    if (context.status === 401 || context.status === 403) {
      return new ChatAdapterError("bad_auth", "Perplexity authentication failed. Check PERPLEXITY_API_KEY or saved credentials.", { provider: "perplexity", status: context.status });
    }
    if (context.status === 429) {
      return new ChatAdapterError("rate_limited", "Perplexity rate limit reached. Wait and try again.", { provider: "perplexity", status: context.status });
    }
    return new ChatAdapterError("provider_error", `Perplexity request failed: ${context.bodyText || "Unknown error"}`, { provider: "perplexity", status: context.status });
  },
};
