import { ChatAdapterError, ensureStringContent } from "../errors";
import type { ChatProviderAdapter, HttpErrorContext, NormalizedChatResponse } from "../types";

export const ecoAdapter: ChatProviderAdapter = {
  id: "eco",
  displayName: "ECO AI",
  baseUrl: "https://api.ecoapi.dev",
  defaultChatEndpoint: "/chat",
  authHeaderFormat: "none",
  supportsStreaming: false,
  auth: {
    required: false,
  },
  models: [
    { id: "eco-ai", displayName: "Llama 3.1 (Free)", provider: "eco", supportsStreaming: false },
  ],
  authHeaders() {
    return {};
  },
  validateRequest(request) {
    if (!ecoAdapter.models.some((model) => model.id === request.model)) {
      throw new ChatAdapterError("unsupported_model", `Unsupported ECO model: ${request.model}`, { provider: "eco" });
    }
    if (request.stream) {
      throw new ChatAdapterError("streaming_not_supported", "ECO AI streaming is not supported.", { provider: "eco" });
    }
  },
  toRequestBody(request) {
    ecoAdapter.validateRequest(request);
    return {
      url: `${ecoAdapter.baseUrl}${ecoAdapter.defaultChatEndpoint}`,
      headers: { "Content-Type": "application/json" },
      body: { messages: request.messages },
    };
  },
  parseResponse(response, request): NormalizedChatResponse {
    const payload = response as { data?: { response?: string } };
    return {
      provider: ecoAdapter.id,
      model: request.model,
      content: ensureStringContent(payload?.data?.response, "No response from ECO AI. The service may be temporarily unavailable.", "eco"),
      raw: response,
    };
  },
  mapHttpError(context: HttpErrorContext) {
    return new ChatAdapterError("provider_error", `ECO AI request failed: ${context.bodyText || "Unknown error"}`, { provider: "eco", status: context.status });
  },
};
