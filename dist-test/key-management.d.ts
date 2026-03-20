import { type ChatProviderId } from "./chat";
import type { KeyServiceId, KeyStatusSource, KeyStatusState, KeyStatusSummary } from "./messages";
export interface KeyValidationSnapshot {
    state: Extract<KeyStatusState, "valid" | "invalid">;
    message?: string;
    lastCheckedAt: string;
}
export interface KeyServiceDescriptor {
    serviceId: KeyServiceId;
    displayName: string;
    kind: "ecoapi" | "provider";
    providerId?: ChatProviderId;
    envKeyName?: string;
    secretStorageKey?: string;
    supportsTest: boolean;
}
export declare function listKeyServices(): KeyServiceDescriptor[];
export declare function getKeyService(serviceId: KeyServiceId): KeyServiceDescriptor;
export declare function maskKeyPreview(value: string | undefined): string | undefined;
export declare function resolveKeyState(source: KeyStatusSource, validation?: KeyValidationSnapshot): KeyStatusState;
export declare function readStoredSecret(service: KeyServiceDescriptor, secrets: {
    get(key: string): Thenable<string | undefined> | Promise<string | undefined>;
}): Promise<string | undefined>;
export declare function buildKeyStatusSummary(service: KeyServiceDescriptor, secrets: {
    get(key: string): Thenable<string | undefined> | Promise<string | undefined>;
}, validationState?: KeyValidationSnapshot): Promise<KeyStatusSummary>;
export declare function validateServiceKey(service: KeyServiceDescriptor, apiKey: string): Promise<KeyValidationSnapshot>;
