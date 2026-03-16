import { ChatAdapterError, ensureStringContent } from "../errors";
import type { ChatProviderAdapter, HttpErrorContext, NormalizedChatResponse } from "../types";

export const cohereAdapter: ChatProviderAdapter = {
  id: "cohere",
  displayName: "Cohere",
  baseUrl: "https://api.cohere.com",
  defaultChatEndpoint: "/v2/chat",
  authHeaderFormat: "Authorization: Bearer <key>",
  supportsStreaming: true,
  auth: {
    envKeyName: "COHERE_API_KEY",
    secretStorageKey: "eco.providerApiKey.cohere",
    required: true,
  },
  models: [
    { id: "command-r", displayName: "Command R", provider: "cohere", supportsStreaming: true },
    { id: "command-r-plus", displayName: "Command R+", provider: "cohere", supportsStreaming: true },
  ],
  authHeaders(apiKey) {
    return { Authorization: `Bearer ${apiKey}` };
  },
  validateRequest(request) {
    if (!cohereAdapter.models.some((model) => model.id === request.model)) {
      throw new ChatAdapterError("unsupported_model", `Unsupported Cohere model: ${request.model}`, { provider: "cohere" });
    }
  },
  toRequestBody(request, apiKey) {
    cohereAdapter.validateRequest(request);
    const systemPrompt = request.systemPrompt ?? request.messages.find((message) => message.role === "system")?.content;
    const chatHistory = request.messages
      .filter((message) => message.role !== "system")
      .slice(0, -1)
      .map((message) => ({
        role: message.role === "assistant" ? "CHATBOT" : "USER",
        message: message.content,
      }));
    const latest = request.messages.filter((message) => message.role !== "system").slice(-1)[0];
    return {
      url: `${cohereAdapter.baseUrl}${cohereAdapter.defaultChatEndpoint}`,
      headers: {
        "Content-Type": "application/json",
        ...cohereAdapter.authHeaders(apiKey ?? ""),
      },
      body: {
        model: request.model,
        message: latest?.content ?? "",
        chat_history: chatHistory,
        preamble: systemPrompt,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: Boolean(request.stream),
      },
    };
  },
  parseResponse(response, request): NormalizedChatResponse {
    const payload = response as Record<string, unknown>;
    const contentBlocks = ((payload.message as Record<string, unknown> | undefined)?.content as Array<Record<string, unknown>> | undefined) ?? [];
    const text =
      (payload.text as string | undefined) ??
      contentBlocks.map((item) => (typeof item.text === "string" ? item.text : "")).join("");
    return {
      provider: cohereAdapter.id,
      model: request.model,
      content: ensureStringContent(text, "Cohere returned an empty response.", "cohere"),
      usage: payload.usage
        ? {
            inputTokens: (((payload.usage as Record<string, unknown>).billed_units as Record<string, unknown> | undefined)?.input_tokens as number | undefined),
            outputTokens: (((payload.usage as Record<string, unknown>).billed_units as Record<string, unknown> | undefined)?.output_tokens as number | undefined),
          }
        : undefined,
      raw: response,
    };
  },
  parseStreamChunk(chunk, request) {
    const payload = chunk as Record<string, unknown>;
    const delta =
      (payload.text as string | undefined) ??
      ((payload.delta as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined)?.content?.toString?.() ??
      ((payload.delta as Record<string, unknown> | undefined)?.text as string | undefined) ??
      ((payload.message as Record<string, unknown> | undefined)?.content as Array<Record<string, unknown>> | undefined)?.map((item) => (typeof item.text === "string" ? item.text : "")).join("") ??
      "";
    const eventType = (payload.type as string | undefined) ?? (payload.event_type as string | undefined);
    if (!delta && eventType !== "message-end" && eventType !== "stream-end") {
      return null;
    }
    return {
      provider: cohereAdapter.id,
      model: request.model,
      delta,
      done: eventType === "message-end" || eventType === "stream-end",
      raw: payload,
    };
  },
  mapHttpError(context: HttpErrorContext) {
    if (context.status === 401 || context.status === 403) {
      return new ChatAdapterError("bad_auth", "Cohere authentication failed. Check COHERE_API_KEY or saved credentials.", { provider: "cohere", status: context.status });
    }
    if (context.status === 429) {
      return new ChatAdapterError("rate_limited", "Cohere rate limit reached. Wait and try again.", { provider: "cohere", status: context.status });
    }
    return new ChatAdapterError("provider_error", `Cohere request failed: ${context.bodyText || "Unknown error"}`, { provider: "cohere", status: context.status });
  },
};
