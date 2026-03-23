import type { EndpointRecord, Suggestion, ScanSummary } from "./analysis/types";
import type { ChatProviderOption } from "./chat";
import type { SimulatorInput, SimulatorResult } from "./simulator/types";
export type KeyServiceId = "ecoapi" | "openai" | "anthropic" | "gemini" | "xai" | "cohere" | "mistral" | "perplexity";
export type KeyStatusState = "missing" | "saved" | "valid" | "invalid" | "from_environment" | "checking";
export type KeyStatusSource = "missing" | "secret" | "env";
export interface KeyStatusSummary {
    serviceId: KeyServiceId;
    displayName: string;
    kind: "ecoapi" | "provider";
    providerId?: string;
    envKeyName?: string;
    source: KeyStatusSource;
    state: KeyStatusState;
    message?: string;
    maskedPreview?: string;
    lastCheckedAt?: string;
    supportsTest: boolean;
}
export type WebviewMessage = {
    type: "startScan";
} | {
    type: "runAiReview";
} | {
    type: "openDashboard";
} | {
    type: "chat";
    provider: string;
    model: string;
    text: string;
} | {
    type: "modelChanged";
    provider: string;
    model: string;
} | {
    type: "applyFix";
    code: string;
    file: string;
    line?: number;
} | {
    type: "openFile";
    file: string;
    line?: number;
} | {
    type: "runSimulation";
    input: SimulatorInput;
} | {
    type: "getAllKeyStatuses";
} | {
    type: "setKey";
    serviceId: KeyServiceId;
    value: string;
} | {
    type: "clearKey";
    serviceId: KeyServiceId;
} | {
    type: "testKey";
    serviceId: KeyServiceId;
} | {
    type: "navigate";
    screen: "landing" | "findings" | "chat" | "simulate" | "keys";
    focusServiceId?: KeyServiceId;
};
export interface SuggestionContext {
    type: string;
    description: string;
    files: string[];
    codeFix?: string;
    severity?: string;
    estimatedMonthlySavings?: number;
    targetFile?: string;
    targetLine?: number;
}
export type HostMessage = {
    type: "triggerScan";
} | {
    type: "scanProgress";
    file: string;
    index: number;
    total: number;
    endpointsSoFar: number;
} | {
    type: "scanComplete";
} | {
    type: "scanResults";
    endpoints: EndpointRecord[];
    suggestions: Suggestion[];
    summary: ScanSummary;
} | {
    type: "aiReviewProgress";
    stage: string;
    current?: number;
    total?: number;
} | {
    type: "aiReviewComplete";
    added: number;
    filtered: number;
} | {
    type: "aiReviewError";
    message: string;
} | {
    type: "chatStreaming";
    chunk: string;
} | {
    type: "chatDone";
    fullContent: string;
} | {
    type: "chatError";
    message: string;
} | {
    type: "chatConfig";
    providers: ChatProviderOption[];
    selectedProvider: string;
    selectedModel: string;
} | {
    type: "allKeyStatuses";
    statuses: KeyStatusSummary[];
    focusServiceId?: KeyServiceId;
} | {
    type: "keyStatusUpdated";
    status: KeyStatusSummary;
    focusServiceId?: KeyServiceId;
} | {
    type: "keyActionError";
    serviceId: KeyServiceId;
    message: string;
} | {
    type: "navigate";
    screen: "landing" | "findings" | "chat" | "simulate" | "keys";
    focusServiceId?: KeyServiceId;
} | {
    type: "error";
    message: string;
} | {
    type: "scanNotification";
    message: string;
} | {
    type: "simulationResult";
    result: SimulatorResult;
} | {
    type: "simulationError";
    message: string;
};
