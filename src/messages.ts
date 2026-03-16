import type { EndpointRecord, Suggestion, ScanSummary } from "./analysis/types";
import type { ChatProviderOption } from "./chat";
import type { SimulatorInput, SimulatorResult } from "./simulator/types";

export type WebviewMessage =
  | { type: "startScan" }
  | { type: "runAiReview" }
  | { type: "openDashboard" }
  | { type: "chat"; provider: string; model: string; text: string }
  | { type: "setApiKey"; provider: string; key: string }
  | { type: "modelChanged"; provider: string; model: string }
  | { type: "applyFix"; code: string; file: string; line?: number }
  | { type: "openFile"; file: string; line?: number }
  | { type: "runSimulation"; input: SimulatorInput }
  | { type: "storeEcoApiKey"; key: string }
  | { type: "clearEcoApiKey" }
  | { type: "getEcoApiKeyStatus" };

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

export type HostMessage =
  | { type: "triggerScan" }
  | { type: "scanProgress"; file: string; index: number; total: number; endpointsSoFar: number }
  | { type: "scanComplete" }
  | { type: "scanResults"; endpoints: EndpointRecord[]; suggestions: Suggestion[]; summary: ScanSummary }
  | { type: "aiReviewProgress"; stage: string; current?: number; total?: number }
  | { type: "aiReviewComplete"; added: number; filtered: number }
  | { type: "aiReviewError"; message: string }
  | { type: "chatStreaming"; chunk: string }
  | { type: "chatDone"; fullContent: string }
  | { type: "chatError"; message: string }
  | { type: "chatConfig"; providers: ChatProviderOption[]; selectedProvider: string; selectedModel: string }
  | { type: "needsApiKey"; provider: string; envKeyName?: string; message?: string }
  | { type: "apiKeyStored"; provider: string }
  | { type: "apiKeyError"; provider: string; message: string }
  | { type: "apiKeyCleared"; provider?: string }
  | { type: "error"; message: string }
  | { type: "simulationResult"; result: SimulatorResult }
  | { type: "simulationError"; message: string }
  | { type: "ecoApiKeyStored" }
  | { type: "ecoApiKeyError"; message: string }
  | { type: "ecoApiKeyCleared" }
  | { type: "ecoApiKeyStatus"; isSet: boolean };
