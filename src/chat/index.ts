import { ChatAdapterError } from "./errors";
import { getProviderAdapter, resolveProviderAuth } from "./provider-registry";
import type { ExecuteChatOptions, NormalizedChatChunk, NormalizedChatResponse } from "./types";

async function readJsonOrText(response: Response): Promise<{ json?: unknown; text: string }> {
  const text = await response.text();
  if (!text.trim()) return { text };
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { text };
  }
}

async function emitSseStream(
  response: Response,
  parseChunk: (chunk: unknown) => NormalizedChatChunk | null,
  onChunk?: (chunk: NormalizedChatChunk) => void | Promise<void>
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new ChatAdapterError("malformed_response", "Streaming response body was missing.");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const payloadText = line.slice(5).trim();
      if (!payloadText || payloadText === "[DONE]") continue;
      let parsed: unknown = payloadText;
      try {
        parsed = JSON.parse(payloadText);
      } catch {
        parsed = payloadText;
      }
      const chunk = parseChunk(parsed);
      if (!chunk) continue;
      if (chunk.delta) fullContent += chunk.delta;
      if (onChunk) await onChunk(chunk);
    }
  }

  return fullContent;
}

export async function executeChat(options: ExecuteChatOptions): Promise<NormalizedChatResponse> {
  const { request, secrets, onChunk, fetchImpl = fetch } = options;
  const adapter = getProviderAdapter(request.provider);
  adapter.validateRequest(request);

  if (request.stream && !adapter.supportsStreaming) {
    throw new ChatAdapterError("streaming_not_supported", `${adapter.displayName} does not support streaming in this integration.`, {
      provider: adapter.id,
    });
  }

  const auth = await resolveProviderAuth(adapter.id, secrets);
  const built = adapter.toRequestBody(request, auth.apiKey);

  let response: Response;
  try {
    response = await fetchImpl(built.url, {
      method: "POST",
      headers: built.headers,
      body: JSON.stringify(built.body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error";
    throw new ChatAdapterError("network_error", `Network error. ${message}`, { provider: adapter.id });
  }

  if (!response.ok) {
    const payload = await readJsonOrText(response);
    throw adapter.mapHttpError({ status: response.status, bodyText: payload.text }, request);
  }

  if (request.stream && adapter.parseStreamChunk) {
    const content = await emitSseStream(response, (chunk) => adapter.parseStreamChunk?.(chunk, request) ?? null, onChunk);
    return {
      provider: adapter.id,
      model: request.model,
      content,
    };
  }

  const payload = await readJsonOrText(response);
  if (payload.json === undefined) {
    throw new ChatAdapterError("malformed_response", `${adapter.displayName} returned a non-JSON response.`, { provider: adapter.id });
  }
  return adapter.parseResponse(payload.json, request);
}

export * from "./errors";
export * from "./provider-registry";
export * from "./types";
