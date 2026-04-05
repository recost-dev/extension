import { useCallback, useEffect, useState } from "react";
import { LandingPage } from "./components/LandingPage";
import { ScanningPage } from "./components/ScanningPage";
import { ResultsPage } from "./components/ResultsPage";
import { SimulatePage } from "./components/SimulatePage";
import { KeysPage } from "./components/KeysPage";
import { postMessage } from "./vscode";
import type {
  Suggestion,
  ScanSummary,
  EndpointRecord,
  HostMessage,
  KeyStatusSummary,
  KeyServiceId,
} from "./types";

type Screen = "landing" | "scanning" | "findings" | "simulate" | "keys";
type ScanStage = "scanning" | "analyzing" | "detecting" | "resolving";

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
  const [scanStage, setScanStage] = useState<ScanStage>("scanning");
  const [scanFile, setScanFile] = useState("");
  const [scanIndex, setScanIndex] = useState(0);
  const [scanTotal, setScanTotal] = useState(0);
  const [scanError, setScanError] = useState("");
  const [endpoints, setEndpoints] = useState<EndpointRecord[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [summary, setSummary] = useState<ScanSummary>({
    totalEndpoints: 0,
    totalCallsPerDay: 0,
    totalMonthlyCost: 0,
    highRiskCount: 0,
  });
  const [keyStatuses, setKeyStatuses] = useState<KeyStatusSummary[]>([]);
  const [focusServiceId, setFocusServiceId] = useState<KeyServiceId | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const hasResults = endpoints.length > 0 || suggestions.length > 0 || summary.totalEndpoints > 0;

  const handleStartScan = useCallback(() => {
    setScanStage("scanning");
    setScanFile("");
    setScanIndex(0);
    setScanTotal(0);
    setScanError("");
    setNotification(null);
    setScreen("scanning");
    postMessage({ type: "startScan" });
  }, []);

  useEffect(() => {
    postMessage({ type: "getAllKeyStatuses" });
    postMessage({ type: "getProjectIdSetting" });
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as HostMessage;

      switch (msg.type) {
        case "scanProgress":
          setScanStage(msg.stage);
          if (msg.stage === "scanning") {
            setScanFile(msg.file);
            setScanIndex(msg.fileIndex);
            setScanTotal(msg.fileTotal);
          }
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
        case "projectIdSetting":
          setProjectIdSetting(msg.value);
          break;
        case "navigate":
          setScreen(msg.screen === "chat" ? "findings" : msg.screen);
          setFocusServiceId(msg.focusServiceId ?? null);
          break;
        case "scanNotification":
          setNotification(msg.message);
          break;
        case "error":
          if (screen === "scanning") {
            setScanError(msg.message);
          }
          break;
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [handleStartScan, screen]);

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {screen !== "scanning" && (
        <div className="eco-tabs">
          <button className={`eco-tab${screen === "findings" ? " active" : ""}`} disabled={!hasResults && screen !== "keys"} onClick={() => setScreen(hasResults ? "findings" : "landing")}>
            Findings
          </button>
          <button className={`eco-tab${screen === "simulate" ? " active" : ""}`} disabled={!hasResults && screen !== "keys"} onClick={() => setScreen(hasResults ? "simulate" : "landing")}>
            Simulate
          </button>
          <button
            className="eco-btn-icon"
            onClick={() => postMessage({ type: "copyAiContext" })}
            disabled={!hasResults}
            title="Copy AI context to clipboard"
            style={{ marginLeft: "8px", padding: "0 8px", fontSize: "11px", display: "flex", alignItems: "center", gap: "3px", opacity: !hasResults ? 0.6 : 1 }}
          >
            Copy Context
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

      {notification && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "7px 12px",
          background: "color-mix(in srgb, var(--vscode-editorWarning-foreground) 12%, var(--vscode-editor-background))",
          borderBottom: "1px solid color-mix(in srgb, var(--vscode-editorWarning-foreground) 30%, transparent)",
          fontSize: "12px",
          color: "var(--vscode-foreground)",
          flexShrink: 0,
        }}>
          <span style={{ flex: 1 }}>{notification}</span>
          <button
            onClick={() => setNotification(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--vscode-descriptionForeground)", padding: "0 2px", lineHeight: 1, fontSize: "14px" }}
          >✕</button>
        </div>
      )}

      {screen === "landing" && <LandingPage onStartScan={handleStartScan} />}
      {screen === "scanning" && (
        <ScanningPage
          stage={scanStage}
          file={scanFile}
          fileIndex={scanIndex}
          fileTotal={scanTotal}
          error={scanError}
          onDismissError={scanError ? () => { setScanError(""); setScreen(hasResults ? "findings" : "landing"); } : undefined}
        />
      )}
      {screen === "findings" && (
        hasResults ? (
          <ResultsPage
            endpoints={endpoints}
            suggestions={suggestions}
            summary={summary}
          />
        ) : (
          <EmptyPanel title="Run a scan first" body="Findings appear here after a workspace scan." />
        )
      )}
      {screen === "simulate" && (
        hasResults ? <SimulatePage endpoints={endpoints} /> : <EmptyPanel title="Run a scan first" body="The simulator needs scan results before it can project API usage." />
      )}
      {screen === "keys" && (
        <KeysPage
          statuses={keyStatuses}
          focusServiceId={focusServiceId}
          projectIdSetting={projectIdSetting}
        />
      )}

    </div>
  );
}
