import type { ChatModelMetadata, ChatProviderAdapter, ChatProviderId, ChatProviderOption, ResolvedProviderAuth, SecretValueReader } from "./types";
export declare function listProviderAdapters(): ChatProviderAdapter[];
export declare function getProviderAdapter(providerId: string): ChatProviderAdapter;
export declare function findModelMetadata(providerId: string, modelId: string): ChatModelMetadata | undefined;
export declare function getDefaultChatSelection(): {
    provider: ChatProviderId;
    model: string;
};
export declare function buildProviderOptions(): ChatProviderOption[];
export declare function resolveProviderAuth(providerId: string, secrets?: SecretValueReader): Promise<ResolvedProviderAuth>;
