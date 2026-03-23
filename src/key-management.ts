import { executeChat, getProviderAdapter, listProviderAdapters, type ChatProviderId } from "./chat";
import { ChatAdapterError } from "./chat/errors";
import type { KeyServiceId, KeyStatusSource, KeyStatusState, KeyStatusSummary } from "./messages";
import { validateRcApiKey } from "./api-client";

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

const ECOAPI_SERVICE: KeyServiceDescriptor = {
  serviceId: "ecoapi",
  displayName: "ReCost",
  kind: "ecoapi",
  secretStorageKey: "recost.apiKey",
  supportsTest: true,
};

export function listKeyServices(): KeyServiceDescriptor[] {
  const providerServices: KeyServiceDescriptor[] = listProviderAdapters()
    .filter((provider): provider is ReturnType<typeof listProviderAdapters>[number] & { id: Exclude<ChatProviderId, "recost"> } => provider.id !== "recost" && provider.auth.required)
    .map((provider) => ({
      serviceId: provider.id,
      displayName: provider.displayName,
      kind: "provider",
      providerId: provider.id,
      envKeyName: provider.auth.envKeyName,
      secretStorageKey: provider.auth.secretStorageKey,
      supportsTest: true,
    }));
  return [ECOAPI_SERVICE, ...providerServices];
}

export function getKeyService(serviceId: KeyServiceId): KeyServiceDescriptor {
  const service = listKeyServices().find((entry) => entry.serviceId === serviceId);
  if (!service) {
    throw new Error(`Unsupported key service: ${serviceId}`);
  }
  return service;
}

export function maskKeyPreview(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  return `${trimmed.slice(0, 6)}••••••••••`;
}

export function resolveKeyState(source: KeyStatusSource, validation?: KeyValidationSnapshot): KeyStatusState {
  if (validation) return validation.state;
  if (source === "env") return "from_environment";
  if (source === "secret") return "saved";
  return "missing";
}

export async function readStoredSecret(
  service: KeyServiceDescriptor,
  secrets: { get(key: string): Thenable<string | undefined> | Promise<string | undefined> }
): Promise<string | undefined> {
  if (!service.secretStorageKey) return undefined;
  const direct = await secrets.get(service.secretStorageKey);
  if (direct?.trim()) return direct.trim();
  if (service.serviceId === "openai") {
    const legacy = await secrets.get("recost.openaiApiKey");
    if (legacy?.trim()) return legacy.trim();
  }
  return undefined;
}

export async function buildKeyStatusSummary(
  service: KeyServiceDescriptor,
  secrets: { get(key: string): Thenable<string | undefined> | Promise<string | undefined> },
  validationState?: KeyValidationSnapshot
): Promise<KeyStatusSummary> {
  const envValue = service.envKeyName ? process.env[service.envKeyName]?.trim() : undefined;
  const storedValue = await readStoredSecret(service, secrets);
  const source: KeyStatusSource = envValue ? "env" : storedValue ? "secret" : "missing";
  return {
    serviceId: service.serviceId,
    displayName: service.displayName,
    kind: service.kind,
    providerId: service.providerId,
    envKeyName: service.envKeyName,
    source,
    state: resolveKeyState(source, validationState),
    message: validationState?.message,
    maskedPreview: maskKeyPreview(envValue ?? storedValue),
    lastCheckedAt: validationState?.lastCheckedAt,
    supportsTest: service.supportsTest,
  };
}

export async function validateServiceKey(
  service: KeyServiceDescriptor,
  apiKey: string
): Promise<KeyValidationSnapshot> {
  const lastCheckedAt = new Date().toISOString();
  try {
    if (service.kind === "ecoapi") {
      await validateRcApiKey(apiKey);
      return { state: "valid", lastCheckedAt };
    }

    const adapter = getProviderAdapter(service.providerId ?? "");
    const model = adapter.models[0]?.id;
    if (!model) {
      return { state: "invalid", message: `${adapter.displayName} has no configured test model.`, lastCheckedAt };
    }

    await executeChat({
      request: {
        provider: adapter.id,
        model,
        messages: [{ role: "user", content: "Reply with OK." }],
        maxTokens: 8,
        temperature: 0,
        stream: false,
      },
      secrets: {
        get: async (key: string) => {
          if (key === adapter.auth.secretStorageKey) return apiKey;
          if (adapter.id === "openai" && key === "recost.openaiApiKey") return apiKey;
          return undefined;
        },
      },
    });
    return { state: "valid", lastCheckedAt };
  } catch (error) {
    if (error instanceof ChatAdapterError && error.code === "bad_auth") {
      return { state: "invalid", message: error.message, lastCheckedAt };
    }
    if (error instanceof Error && service.kind === "ecoapi" && /401|403|unauth|invalid/i.test(error.message)) {
      return { state: "invalid", message: error.message, lastCheckedAt };
    }
    throw error;
  }
}
