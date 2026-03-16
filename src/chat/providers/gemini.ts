import { ChatAdapterError, ensureStringContent } from "../errors";
import type { ChatProviderAdapter, HttpErrorContext, NormalizedChatResponse } from "../types";

function toGeminiRole(role: string): "user" | "model" {
  return role === "assistant" ? "model" : "user";
}

export const geminiAdapter: ChatProviderAdapter = {
  id: "gemini",
  displayName: "Google Gemini",
  baseUrl: "https://generativelanguage.googleapis.com",
  defaultChatEndpoint: "/v1beta/models/{model}:generateContent",
  authHeaderFormat: "x-goog-api-key",
  supportsStreaming: true,
  auth: {
    envKeyName: "GEMINI_API_KEY",
    secretStorageKey: "eco.providerApiKey.gemini",
    required: true,
  },
  models: [
    { id: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash", provider: "gemini", supportsStreaming: true },
    { id: "gemini-2.0-flash-lite", displayName: "Gemini 2.0 Flash-Lite", provider: "gemini", supportsStreaming: true },
    { id: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro", provider: "gemini", supportsStreaming: true },
  ],
  authHeaders(apiKey) {
    return { "x-goog-api-key": apiKey };
  },
  validateRequest(request) {
    if (!geminiAdapter.models.some((model) => model.id === request.model)) {
      throw new ChatAdapterError("unsupported_model", `Unsupported Gemini model: ${request.model}`, { provider: "gemini" });
    }
  },
  toRequestBody(request, apiKey) {
    geminiAdapter.validateRequest(request);
    const contents = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: toGeminiRole(message.role),
        parts: [{ text: message.content }],
      }));
    const endpoint = request.stream
      ? `/v1beta/models/${encodeURIComponent(request.model)}:streamGenerateContent?alt=sse`
      : `/v1beta/models/${encodeURIComponent(request.model)}:generateContent`;
    const body: Record<string, unknown> = { contents };
    const systemPrompt = request.systemPrompt ?? request.messages.find((message) => message.role === "system")?.content;
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }
    if (typeof request.temperature === "number" || typeof request.maxTokens === "number") {
      body.generationConfig = {
        ...(typeof request.temperature === "number" ? { temperature: request.temperature } : {}),
        ...(typeof request.maxTokens === "number" ? { maxOutputTokens: request.maxTokens } : {}),
      };
    }
    return {
      url: `${geminiAdapter.baseUrl}${endpoint}`,
      headers: {
        "Content-Type": "application/json",
        ...geminiAdapter.authHeaders(apiKey ?? ""),
      },
      body,
    };
  },
  parseResponse(response, request): NormalizedChatResponse {
    const payload = response as Record<string, unknown>;
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const content = (candidates[0] as Record<string, unknown> | undefined)?.content as Record<string, unknown> | undefined;
    const parts = (content?.parts as Array<Record<string, unknown>> | undefined) ?? [];
    const text = parts.map((part) => (typeof part.text === "string" ? part.text : "")).join("");
    const usage = payload.usageMetadata as Record<string, unknown> | undefined;
    return {
      provider: geminiAdapter.id,
      model: request.model,
      content: ensureStringContent(text, "Gemini returned an empty response.", "gemini"),
      stopReason: (candidates[0] as Record<string, unknown> | undefined)?.finishReason as string | undefined,
      usage: usage
        ? {
            inputTokens: usage.promptTokenCount as number | undefined,
            outputTokens: usage.candidatesTokenCount as number | undefined,
            totalTokens: usage.totalTokenCount as number | undefined,
          }
        : undefined,
      raw: response,
    };
  },
  parseStreamChunk(chunk, request) {
    const payload = chunk as Record<string, unknown>;
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const content = (candidates[0] as Record<string, unknown> | undefined)?.content as Record<string, unknown> | undefined;
    const parts = (content?.parts as Array<Record<string, unknown>> | undefined) ?? [];
    const delta = parts.map((part) => (typeof part.text === "string" ? part.text : "")).join("");
    if (!delta && !(candidates[0] as Record<string, unknown> | undefined)?.finishReason) return null;
    return {
      provider: geminiAdapter.id,
      model: request.model,
      delta,
      done: Boolean((candidates[0] as Record<string, unknown> | undefined)?.finishReason),
      raw: payload,
    };
  },
  mapHttpError(context: HttpErrorContext) {
    if (context.status === 401 || context.status === 403) {
      return new ChatAdapterError("bad_auth", "Gemini authentication failed. Check GEMINI_API_KEY or saved credentials.", { provider: "gemini", status: context.status });
    }
    if (context.status === 429) {
      return new ChatAdapterError("rate_limited", "Gemini rate limit reached. Wait and try again.", { provider: "gemini", status: context.status });
    }
    return new ChatAdapterError("provider_error", `Gemini request failed: ${context.bodyText || "Unknown error"}`, { provider: "gemini", status: context.status });
  },
};
