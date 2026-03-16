import { ChatAdapterError } from "../errors";
import type { ChatProviderAdapter, HttpErrorContext } from "../types";
import { openAiAdapter } from "./openai";

export const mistralAdapter: ChatProviderAdapter = {
  ...openAiAdapter,
  id: "mistral",
  displayName: "Mistral",
  baseUrl: "https://api.mistral.ai",
  auth: {
    envKeyName: "MISTRAL_API_KEY",
    secretStorageKey: "eco.providerApiKey.mistral",
    required: true,
  },
  models: [
    { id: "mistral-small-latest", displayName: "Mistral Small", provider: "mistral", supportsStreaming: true },
    { id: "mistral-large-latest", displayName: "Mistral Large", provider: "mistral", supportsStreaming: true },
    { id: "open-mixtral-8x22b", displayName: "Mixtral 8x22B", provider: "mistral", supportsStreaming: true },
  ],
  validateRequest(request) {
    if (!mistralAdapter.models.some((model) => model.id === request.model)) {
      throw new ChatAdapterError("unsupported_model", `Unsupported Mistral model: ${request.model}`, { provider: "mistral" });
    }
  },
  mapHttpError(context: HttpErrorContext) {
    if (context.status === 401 || context.status === 403) {
      return new ChatAdapterError("bad_auth", "Mistral authentication failed. Check MISTRAL_API_KEY or saved credentials.", { provider: "mistral", status: context.status });
    }
    if (context.status === 429) {
      return new ChatAdapterError("rate_limited", "Mistral rate limit reached. Wait and try again.", { provider: "mistral", status: context.status });
    }
    return new ChatAdapterError("provider_error", `Mistral request failed: ${context.bodyText || "Unknown error"}`, { provider: "mistral", status: context.status });
  },
};
