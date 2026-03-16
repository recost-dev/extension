import { ChatAdapterError, ensureStringContent } from "../errors";
import type { ChatProviderAdapter, HttpErrorContext, NormalizedChatRequest, NormalizedChatResponse } from "../types";

function anthropicMessages(request: NormalizedChatRequest) {
  return request.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role,
      content: [{ type: "text", text: message.content }],
    }));
}

export const anthropicAdapter: ChatProviderAdapter = {
  id: "anthropic",
  displayName: "Anthropic",
  baseUrl: "https://api.anthropic.com",
  defaultChatEndpoint: "/v1/messages",
  authHeaderFormat: "x-api-key",
  supportsStreaming: true,
  auth: {
    envKeyName: "ANTHROPIC_API_KEY",
    secretStorageKey: "eco.providerApiKey.anthropic",
    required: true,
  },
  models: [
    { id: "claude-3-5-haiku-latest", displayName: "Claude 3.5 Haiku", provider: "anthropic", supportsStreaming: true },
    { id: "claude-3-7-sonnet-latest", displayName: "Claude 3.7 Sonnet", provider: "anthropic", supportsStreaming: true },
    { id: "claude-3-5-sonnet-latest", displayName: "Claude 3.5 Sonnet", provider: "anthropic", supportsStreaming: true },
  ],
  authHeaders(apiKey) {
    return {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
  },
  validateRequest(request) {
    if (!anthropicAdapter.models.some((model) => model.id === request.model)) {
      throw new ChatAdapterError("unsupported_model", `Unsupported Anthropic model: ${request.model}`, { provider: "anthropic" });
    }
  },
  toRequestBody(request, apiKey) {
    anthropicAdapter.validateRequest(request);
    const systemPrompt =
      request.systemPrompt ??
      request.messages.find((message) => message.role === "system")?.content;
    const body: Record<string, unknown> = {
      model: request.model,
      messages: anthropicMessages(request),
      stream: Boolean(request.stream),
    };
    if (systemPrompt) body.system = systemPrompt;
    if (typeof request.maxTokens === "number") body.max_tokens = request.maxTokens;
    else body.max_tokens = 1024;
    if (typeof request.temperature === "number") body.temperature = request.temperature;
    return {
      url: `${anthropicAdapter.baseUrl}${anthropicAdapter.defaultChatEndpoint}`,
      headers: {
        "Content-Type": "application/json",
        ...anthropicAdapter.authHeaders(apiKey ?? ""),
      },
      body,
    };
  },
  parseResponse(response, request): NormalizedChatResponse {
    const payload = response as Record<string, unknown>;
    const content = Array.isArray(payload.content) ? payload.content : [];
    const text = content
      .map((item) => ((item as Record<string, unknown>).text as string | undefined) ?? "")
      .join("");
    return {
      provider: anthropicAdapter.id,
      model: request.model,
      content: ensureStringContent(text, "Anthropic returned an empty response.", "anthropic"),
      stopReason: payload.stop_reason as string | undefined,
      usage: payload.usage
        ? {
            inputTokens: (payload.usage as Record<string, unknown>).input_tokens as number | undefined,
            outputTokens: (payload.usage as Record<string, unknown>).output_tokens as number | undefined,
            totalTokens:
              (((payload.usage as Record<string, unknown>).input_tokens as number | undefined) ?? 0) +
              (((payload.usage as Record<string, unknown>).output_tokens as number | undefined) ?? 0),
          }
        : undefined,
      raw: response,
    };
  },
  parseStreamChunk(chunk, request) {
    const payload = chunk as Record<string, unknown>;
    if (payload.type === "content_block_delta") {
      const delta = ((payload.delta as Record<string, unknown> | undefined)?.text as string | undefined) ?? "";
      if (!delta) return null;
      return { provider: anthropicAdapter.id, model: request.model, delta, raw: payload };
    }
    if (payload.type === "message_stop") {
      return { provider: anthropicAdapter.id, model: request.model, delta: "", done: true, raw: payload };
    }
    return null;
  },
  mapHttpError(context: HttpErrorContext) {
    if (context.status === 401 || context.status === 403) {
      return new ChatAdapterError("bad_auth", "Anthropic authentication failed. Check ANTHROPIC_API_KEY or saved credentials.", { provider: "anthropic", status: context.status });
    }
    if (context.status === 429) {
      return new ChatAdapterError("rate_limited", "Anthropic rate limit reached. Wait and try again.", { provider: "anthropic", status: context.status });
    }
    return new ChatAdapterError("provider_error", `Anthropic request failed: ${context.bodyText || "Unknown error"}`, { provider: "anthropic", status: context.status });
  },
};
