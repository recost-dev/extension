import type { ChatProviderId } from "./types";
export type ChatErrorCode = "missing_api_key" | "unsupported_provider" | "unsupported_model" | "bad_auth" | "rate_limited" | "malformed_response" | "network_error" | "streaming_not_supported" | "provider_error";
export declare class ChatAdapterError extends Error {
    readonly code: ChatErrorCode;
    readonly provider?: ChatProviderId;
    readonly envKeyName?: string;
    readonly status?: number;
    constructor(code: ChatErrorCode, message: string, options?: {
        provider?: ChatProviderId;
        envKeyName?: string;
        status?: number;
    });
}
export declare function ensureStringContent(value: unknown, fallbackMessage: string, provider?: ChatProviderId): string;
