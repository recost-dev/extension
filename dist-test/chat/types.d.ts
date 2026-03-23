export type ChatProviderId = "recost" | "openai" | "anthropic" | "gemini" | "xai" | "cohere" | "mistral" | "perplexity";
export type ChatRole = "system" | "user" | "assistant";
export interface NormalizedChatMessage {
    role: ChatRole;
    content: string;
}
export interface NormalizedChatRequest {
    provider: string;
    model: string;
    systemPrompt?: string;
    messages: NormalizedChatMessage[];
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
}
export interface TokenUsage {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
}
export interface NormalizedChatResponse {
    provider: string;
    model: string;
    content: string;
    stopReason?: string;
    usage?: TokenUsage;
    raw?: unknown;
}
export interface NormalizedChatChunk {
    provider: string;
    model: string;
    delta: string;
    done?: boolean;
    raw?: unknown;
}
export interface ChatModelMetadata {
    id: string;
    displayName: string;
    provider: ChatProviderId;
    supportsStreaming?: boolean;
    reasoning?: boolean;
}
export interface ProviderAuthConfig {
    envKeyName?: string;
    secretStorageKey?: string;
    required: boolean;
}
export interface ChatProviderOption {
    id: ChatProviderId;
    displayName: string;
    envKeyName?: string;
    baseUrl: string;
    defaultChatEndpoint: string;
    authHeaderFormat: string;
    supportsStreaming: boolean;
    models: ChatModelOption[];
}
export interface ChatModelOption {
    id: string;
    displayName: string;
    providerId: ChatProviderId;
    supportsStreaming: boolean;
}
export interface ChatProviderConfig {
    id: ChatProviderId;
    displayName: string;
    baseUrl: string;
    defaultChatEndpoint: string;
    authHeaderFormat: string;
    supportsStreaming: boolean;
    auth: ProviderAuthConfig;
    models: ChatModelMetadata[];
}
export interface HttpErrorContext {
    status: number;
    bodyText: string;
}
export interface RequestBuildResult {
    url: string;
    headers: Record<string, string>;
    body: unknown;
}
export interface ChatProviderAdapter extends ChatProviderConfig {
    authHeaders(apiKey: string): Record<string, string>;
    validateRequest(request: NormalizedChatRequest): void;
    toRequestBody(request: NormalizedChatRequest, apiKey?: string): RequestBuildResult;
    parseResponse(response: unknown, request: NormalizedChatRequest): NormalizedChatResponse;
    parseStreamChunk?(chunk: unknown, request: NormalizedChatRequest): NormalizedChatChunk | null;
    mapHttpError(context: HttpErrorContext, request: NormalizedChatRequest): Error;
}
export interface SecretValueReader {
    get(key: string): Thenable<string | undefined> | Promise<string | undefined>;
}
export interface ResolvedProviderAuth {
    apiKey?: string;
    source: "none" | "env" | "secret";
}
export interface ExecuteChatOptions {
    request: NormalizedChatRequest;
    secrets?: SecretValueReader;
    onChunk?: (chunk: NormalizedChatChunk) => void | Promise<void>;
    fetchImpl?: typeof fetch;
}
