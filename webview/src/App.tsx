import { useCallback, useEffect, useMemo, useState } from "react";
import { LandingPage } from "./components/LandingPage";
import { ScanningPage } from "./components/ScanningPage";
import { ResultsPage } from "./components/ResultsPage";
import { ChatPage } from "./components/ChatPage";
import { SimulatePage } from "./components/SimulatePage";
import { KeysPage } from "./components/KeysPage";
import { postMessage } from "./vscode";
import type {
  Suggestion,
  ScanSummary,
  EndpointRecord,
  HostMessage,
  ChatProviderOption,
  SuggestionContext,
  KeyStatusSummary,
  KeyServiceId,
} from "./types";

type Screen = "landing" | "scanning" | "findings" | "chat" | "simulate" | "keys";

function toServiceId(providerId: string): KeyServiceId | null {
  if (providerId === "eco") return null;
  return providerId as KeyServiceId;
}

function canUseChatProvider(statuses: KeyStatusSummary[], providerId: string): boolean {
  if (providerId === "eco") return true;
  const serviceId = toServiceId(providerId);
  const match = serviceId ? statuses.find((entry) => entry.serviceId === serviceId) : undefined;
  return Boolean(match && ["saved", "valid", "from_environment"].includes(match.state));
}

function getGlobalBanner(
  statuses: KeyStatusSummary[],
  selectedProvider: string,
  hasResults: boolean
): { serviceId: KeyServiceId; text: string } | null {
  const selectedServiceId = toServiceId(selectedProvider);
  const findStatus = (serviceId: KeyServiceId) => statuses.find((entry) => entry.serviceId === serviceId);
  const selectedStatus = selectedServiceId ? findStatus(selectedServiceId) : undefined;
  const ecoStatus = findStatus("ecoapi");
  const otherInvalid = statuses.find((entry) => entry.serviceId !== "ecoapi" && entry.serviceId !== selectedServiceId && entry.state === "invalid");

  if (ecoStatus?.state === "invalid") return { serviceId: "ecoapi", text: "EcoAPI: Invalid key" };
  if (selectedStatus?.state === "invalid") return { serviceId: selectedStatus.serviceId, text: `${selectedStatus.displayName}: Invalid key` };
  if (hasResults && ecoStatus?.state === "missing") return { serviceId: "ecoapi", text: "EcoAPI: Missing key" };
  if (selectedStatus?.state === "missing") return { serviceId: selectedStatus.serviceId, text: `${selectedStatus.displayName}: Missing key` };
  if (otherInvalid) return { serviceId: otherInvalid.serviceId, text: `${otherInvalid.displayName}: Invalid key` };
  return null;
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ maxWidth: "360px", textAlign: "center", color: "var(--vscode-descriptionForeground)" }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--vscode-foreground)", marginBottom: "6px" }}>{title}</div>
        <div style={{ fontSize: "12px", lineHeight: 1.5 }}>{body}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [scanFiles, setScanFiles] = useState<string[]>([]);
  const [scanIndex, setScanIndex] = useState(0);
  const [scanTotal, setScanTotal] = useState(0);
  const [endpointCount, setEndpointCount] = useState(0);
  const [scanError, setScanError] = useState("");
  const [endpoints, setEndpoints] = useState<EndpointRecord[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [summary, setSummary] = useState<ScanSummary>({
    totalEndpoints: 0,
    totalCallsPerDay: 0,
    totalMonthlyCost: 0,
    highRiskCount: 0,
  });
  const [aiReviewRunning, setAiReviewRunning] = useState(false);
  const [aiReviewStage, setAiReviewStage] = useState("");
  const [aiReviewError, setAiReviewError] = useState("");
  const [aiReviewStats, setAiReviewStats] = useState<{ added: number; filtered: number } | null>(null);
  const [configuredAiReviewModel, setConfiguredAiReviewModel] = useState("current chat model");
  const [providers, setProviders] = useState<ChatProviderOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("eco");
  const [selectedModel, setSelectedModel] = useState("eco-ai");
  const [keyStatuses, setKeyStatuses] = useState<KeyStatusSummary[]>([]);
  const [focusServiceId, setFocusServiceId] = useState<KeyServiceId | null>(null);
  const [chatContext, setChatContext] = useState<SuggestionContext | null>(null);

  const hasResults = endpoints.length > 0 || suggestions.length > 0 || summary.totalEndpoints > 0;
  const banner = useMemo(
    () => getGlobalBanner(keyStatuses, selectedProvider, hasResults),
    [keyStatuses, selectedProvider, hasResults]
  );

  const handleStartScan = useCallback(() => {
    setScanFiles([]);
    setScanIndex(0);
    setScanTotal(0);
    setEndpointCount(0);
    setScanError("");
    setAiReviewRunning(false);
    setAiReviewStage("");
    setAiReviewError("");
    setAiReviewStats(null);
    setScreen("scanning");
    postMessage({ type: "startScan" });
  }, []);

  const handleRunAiReview = useCallback(() => {
    setAiReviewRunning(true);
    setAiReviewStage("Starting AI review...");
    setAiReviewError("");
    setAiReviewStats(null);
    postMessage({ type: "runAiReview" });
  }, []);

  const handleManageKeys = useCallback((serviceId?: KeyServiceId | null) => {
    setScreen("keys");
    setFocusServiceId(serviceId ?? null);
    postMessage({ type: "navigate", screen: "keys", focusServiceId: serviceId ?? undefined });
    postMessage({ type: "getAllKeyStatuses" });
  }, []);

  useEffect(() => {
    postMessage({ type: "getAllKeyStatuses" });
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as HostMessage;

      switch (msg.type) {
        case "scanProgress":
          setScanFiles((prev) => (prev.includes(msg.file) ? prev : [...prev, msg.file]));
          setScanIndex(msg.index);
          setScanTotal(msg.total);
          setEndpointCount(msg.endpointsSoFar);
          break;
        case "triggerScan":
          handleStartScan();
          break;
        case "scanResults":
          setEndpoints(msg.endpoints);
          setSuggestions(msg.suggestions);
          setSummary(msg.summary);
          setScanError("");
          setScreen("findings");
          break;
        case "aiReviewProgress":
          setAiReviewRunning(true);
          setAiReviewStage(msg.stage);
          break;
        case "aiReviewComplete":
          setAiReviewRunning(false);
          setAiReviewStage("");
          setAiReviewStats({ added: msg.added, filtered: msg.filtered });
          break;
        case "aiReviewError":
          setAiReviewRunning(false);
          setAiReviewStage("");
          setAiReviewError(msg.message);
          break;
        case "chatConfig": {
          setProviders(msg.providers);
          setSelectedProvider(msg.selectedProvider);
          setSelectedModel(msg.selectedModel);
          const provider = msg.providers.find((entry) => entry.id === msg.selectedProvider);
          const model = provider?.models.find((entry) => entry.id === msg.selectedModel);
          const label = [provider?.displayName, model?.displayName].filter(Boolean).join(" · ");
          setConfiguredAiReviewModel(label || msg.selectedModel);
          break;
        }
        case "allKeyStatuses":
          setKeyStatuses(msg.statuses);
          setFocusServiceId(msg.focusServiceId ?? null);
          break;
        case "keyStatusUpdated":
          setKeyStatuses((prev) => {
            const next = prev.filter((entry) => entry.serviceId !== msg.status.serviceId);
            next.push(msg.status);
            return next;
          });
          setFocusServiceId(msg.focusServiceId ?? null);
          break;
        case "keyActionError":
          setKeyStatuses((prev) =>
            prev.map((entry) =>
              entry.serviceId === msg.serviceId ? { ...entry, message: msg.message } : entry
            )
          );
          break;
        case "navigate":
          setScreen(msg.screen);
          setFocusServiceId(msg.focusServiceId ?? null);
          break;
        case "error":
          if (screen === "scanning") {
            setScanError(msg.message);
          } else {
            setAiReviewError(msg.message);
          }
          break;
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [handleStartScan, screen]);

  const selectedProviderStatus = keyStatuses.find((entry) => entry.serviceId === toServiceId(selectedProvider));
  const chatUsable = canUseChatProvider(keyStatuses, selectedProvider);

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {screen !== "scanning" && (
        <div className="eco-tabs">
          <button className={`eco-tab${screen === "findings" ? " active" : ""}`} disabled={!hasResults} onClick={() => setScreen("findings")}>
            Findings
          </button>
          <button className={`eco-tab${screen === "chat" ? " active" : ""}`} disabled={!hasResults} onClick={() => setScreen("chat")}>
            Chat
          </button>
          <button className={`eco-tab${screen === "simulate" ? " active" : ""}`} disabled={!hasResults} onClick={() => setScreen("simulate")}>
            Simulate
          </button>
          <button className={`eco-tab${screen === "keys" ? " active" : ""}`} onClick={() => handleManageKeys(focusServiceId)}>
            Keys
          </button>
          <button
            className="eco-btn-icon"
            onClick={handleRunAiReview}
            disabled={!hasResults || aiReviewRunning}
            title={`Run AI Review with ${configuredAiReviewModel}`}
            style={{ marginLeft: "8px", padding: "0 8px", fontSize: "11px", display: "flex", alignItems: "center", gap: "3px", opacity: !hasResults || aiReviewRunning ? 0.6 : 1 }}
          >
            {aiReviewRunning ? "Reviewing..." : "Run AI Review"}
          </button>
          <button
            className="eco-btn-icon"
            onClick={() => postMessage({ type: "openDashboard" })}
            title="Open Dashboard"
            style={{ marginLeft: "auto", padding: "0 12px 0 8px", fontSize: "11px", display: "flex", alignItems: "center", gap: "3px" }}
          >
            Dashboard
          </button>
        </div>
      )}

      {screen === "landing" && <LandingPage onStartScan={handleStartScan} />}
      {screen === "scanning" && (
        <ScanningPage files={scanFiles} currentIndex={scanIndex} endpointCount={endpointCount} total={scanTotal} error={scanError} />
      )}
      {screen === "findings" && (
        hasResults ? (
          <ResultsPage
            endpoints={endpoints}
            suggestions={suggestions}
            summary={summary}
            aiReviewRunning={aiReviewRunning}
            aiReviewStage={aiReviewStage}
            aiReviewError={aiReviewError}
            aiReviewStats={aiReviewStats}
            onAskAI={(context) => {
              setChatContext(context);
              setScreen("chat");
            }}
          />
        ) : (
          <EmptyPanel title="Run a scan first" body="Findings appear here after a workspace scan." />
        )
      )}
      {screen === "chat" && (
        hasResults ? (
          <ChatPage
            context={chatContext}
            summary={summary}
            endpointCount={endpoints.length}
            keyStatuses={keyStatuses}
            currentProviderStatus={selectedProviderStatus}
            chatUsable={chatUsable}
            onManageKeys={() => handleManageKeys(toServiceId(selectedProvider))}
          />
        ) : (
          <EmptyPanel title="Run a scan first" body="Chat becomes available after the extension has scan context to work from." />
        )
      )}
      {screen === "simulate" && (
        hasResults ? <SimulatePage endpoints={endpoints} /> : <EmptyPanel title="Run a scan first" body="The simulator needs scan results before it can project API usage." />
      )}
      {screen === "keys" && <KeysPage statuses={keyStatuses} focusServiceId={focusServiceId} />}

      {screen !== "scanning" && banner && (
        <button
          onClick={() => handleManageKeys(banner.serviceId)}
          style={{
            border: "none",
            borderTop: "1px solid color-mix(in srgb, var(--vscode-editorWarning-foreground) 55%, black 45%)",
            background: "var(--vscode-editorWarning-background, #f8d568)",
            color: "var(--vscode-editorWarning-foreground, #5c4300)",
            padding: "9px 12px",
            textAlign: "left",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: 600,
          }}
        >
          {banner.text} · Manage Keys
        </button>
      )}
    </div>
  );
}
