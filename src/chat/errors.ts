import type { ChatProviderId } from "./types";

export type ChatErrorCode =
  | "missing_api_key"
  | "unsupported_provider"
  | "unsupported_model"
  | "bad_auth"
  | "rate_limited"
  | "malformed_response"
  | "network_error"
  | "streaming_not_supported"
  | "provider_error";

export class ChatAdapterError extends Error {
  public readonly code: ChatErrorCode;
  public readonly provider?: ChatProviderId;
  public readonly envKeyName?: string;
  public readonly status?: number;

  constructor(
    code: ChatErrorCode,
    message: string,
    options: { provider?: ChatProviderId; envKeyName?: string; status?: number } = {}
  ) {
    super(message);
    this.name = "ChatAdapterError";
    this.code = code;
    this.provider = options.provider;
    this.envKeyName = options.envKeyName;
    this.status = options.status;
  }
}

export function ensureStringContent(
  value: unknown,
  fallbackMessage: string,
  provider?: ChatProviderId
): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  throw new ChatAdapterError("malformed_response", fallbackMessage, { provider });
}
