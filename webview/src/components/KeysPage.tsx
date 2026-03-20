import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyServiceId, KeyStatusSummary } from "../types";
import { postMessage } from "../vscode";

interface KeysPageProps {
  statuses: KeyStatusSummary[];
  focusServiceId?: KeyServiceId | null;
}

function statusLabel(status: KeyStatusSummary): string {
  switch (status.state) {
    case "from_environment":
      return "From Environment";
    case "saved":
      return "Saved";
    case "valid":
      return "Valid";
    case "invalid":
      return "Invalid";
    case "checking":
      return "Checking...";
    default:
      return "Missing";
  }
}

function statusColor(status: KeyStatusSummary): string {
  switch (status.state) {
    case "valid":
      return "var(--vscode-testing-iconPassed, #4caf50)";
    case "invalid":
      return "var(--vscode-editorError-foreground)";
    case "checking":
      return "var(--vscode-editorWarning-foreground)";
    case "saved":
    case "from_environment":
      return "var(--vscode-textLink-foreground)";
    default:
      return "var(--vscode-descriptionForeground)";
  }
}

export function KeysPage({ statuses, focusServiceId }: KeysPageProps) {
  const [expandedServiceId, setExpandedServiceId] = useState<KeyServiceId | null>(focusServiceId ?? null);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const autosaveTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    if (focusServiceId) {
      setExpandedServiceId(focusServiceId);
    }
  }, [focusServiceId]);

  const sortedStatuses = useMemo(() => {
    return statuses.slice().sort((a, b) => {
      if (a.serviceId === "ecoapi") return -1;
      if (b.serviceId === "ecoapi") return 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [statuses]);

  const save = (serviceId: KeyServiceId) => {
    const value = (draftValues[serviceId] ?? "").trim();
    if (!value) {
      setErrors((prev) => ({ ...prev, [serviceId]: "API key must not be empty." }));
      return;
    }
    setErrors((prev) => ({ ...prev, [serviceId]: "" }));
    postMessage({ type: "setKey", serviceId, value });
    setDraftValues((prev) => ({ ...prev, [serviceId]: "" }));
  };

  useEffect(() => {
    return () => {
      for (const timer of Object.values(autosaveTimers.current)) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  return (
    <div className="eco-scroll-invisible" style={{ flex: 1, overflowY: "auto", padding: "16px", minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <div style={{ fontSize: "15px", fontWeight: 600, marginBottom: "4px" }}>Keys</div>
          <p style={{ margin: 0, color: "var(--vscode-descriptionForeground)", fontSize: "12px", lineHeight: 1.5 }}>
            Manage EcoAPI and model provider credentials in one place. Expanded rows save automatically as you enter a key.
          </p>
        </div>

        {sortedStatuses.map((status) => {
          const isExpanded = expandedServiceId === status.serviceId;
          const canClear = status.source === "secret";
          return (
            <div
              key={status.serviceId}
              style={{
                border: "1px solid var(--vscode-panel-border)",
                borderRadius: "8px",
                padding: "14px",
                background: "var(--vscode-editor-background)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <button
                onClick={() => {
                  setExpandedServiceId((prev) => (prev === status.serviceId ? null : status.serviceId));
                }}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  alignItems: "center",
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  color: "inherit",
                  padding: 0,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>{status.displayName}</div>
                  {isExpanded && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    {status.maskedPreview && (
                      <span style={{ color: "var(--vscode-descriptionForeground)", fontSize: "11px" }}>
                        {status.maskedPreview}
                      </span>
                    )}
                    {status.lastCheckedAt && (
                      <span style={{ color: "var(--vscode-descriptionForeground)", fontSize: "11px" }}>
                        Checked {new Date(status.lastCheckedAt).toLocaleTimeString()}
                      </span>
                    )}
                    </div>
                  )}
                  {isExpanded && status.message && (
                    <div style={{ color: status.state === "invalid" ? "var(--vscode-editorError-foreground)" : "var(--vscode-descriptionForeground)", fontSize: "11px" }}>
                      {status.message}
                    </div>
                  )}
                  {isExpanded && status.envKeyName && (
                    <div style={{ color: "var(--vscode-descriptionForeground)", fontSize: "11px" }}>
                      Environment variable: <code>{status.envKeyName}</code>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "3px 9px",
                      borderRadius: "999px",
                      background: "color-mix(in srgb, var(--vscode-editorGroupHeader-tabsBackground) 72%, transparent)",
                      border: "1px solid color-mix(in srgb, currentColor 40%, var(--vscode-panel-border) 60%)",
                      boxShadow: "inset 0 0 0 1px color-mix(in srgb, currentColor 10%, transparent)",
                      color: statusColor(status),
                      fontSize: "11px",
                      fontWeight: 600,
                    }}
                  >
                    {statusLabel(status)}
                  </span>
                  <span
                    style={{
                      width: "22px",
                      height: "22px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "999px",
                      background: "var(--vscode-editorGroupHeader-tabsBackground)",
                      border: "1px solid var(--vscode-panel-border)",
                      transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 150ms ease",
                    }}
                  >
                    <span className="codicon codicon-chevron-down" style={{ fontSize: "12px" }} />
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--vscode-descriptionForeground)", fontWeight: 600 }}>
                    {isExpanded ? "Collapse" : "Expand"}
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px solid var(--vscode-panel-border)", paddingTop: "10px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "var(--vscode-input-background)",
                      border: "1px solid var(--vscode-input-border, var(--vscode-panel-border))",
                      borderRadius: "6px",
                      padding: "4px",
                    }}
                  >
                    <input
                      type="password"
                      value={draftValues[status.serviceId] ?? ""}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setDraftValues((prev) => ({ ...prev, [status.serviceId]: nextValue }));
                        setErrors((prev) => ({ ...prev, [status.serviceId]: "" }));
                        const existingTimer = autosaveTimers.current[status.serviceId];
                        if (existingTimer) window.clearTimeout(existingTimer);
                        autosaveTimers.current[status.serviceId] = window.setTimeout(() => {
                          const trimmed = nextValue.trim();
                          if (!trimmed) return;
                          postMessage({ type: "setKey", serviceId: status.serviceId, value: trimmed });
                          setDraftValues((prev) => ({ ...prev, [status.serviceId]: "" }));
                        }, 400);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          const existingTimer = autosaveTimers.current[status.serviceId];
                          if (existingTimer) window.clearTimeout(existingTimer);
                          save(status.serviceId);
                        }
                        if (event.key === "Escape") {
                          const existingTimer = autosaveTimers.current[status.serviceId];
                          if (existingTimer) window.clearTimeout(existingTimer);
                          setDraftValues((prev) => ({ ...prev, [status.serviceId]: "" }));
                        }
                      }}
                      placeholder={`Paste ${status.displayName} key`}
                      style={{
                        flex: 1,
                        background: "transparent",
                        color: "var(--vscode-input-foreground)",
                        border: "none",
                        outline: "none",
                        fontFamily: "var(--vscode-font-family)",
                        fontSize: "var(--vscode-font-size)",
                        padding: "4px 8px",
                      }}
                    />
                    {canClear && (
                      <button
                        className="eco-btn-secondary"
                        onClick={() => postMessage({ type: "clearKey", serviceId: status.serviceId })}
                        title="Delete saved key"
                        style={{
                          color: "var(--vscode-errorForeground, #f14c4c)",
                          borderColor: "color-mix(in srgb, var(--vscode-errorForeground, #f14c4c) 55%, var(--vscode-input-border, var(--vscode-panel-border)) 45%)",
                          background: "color-mix(in srgb, var(--vscode-errorForeground, #f14c4c) 10%, transparent)",
                          width: "32px",
                          minWidth: "32px",
                          justifyContent: "center",
                          padding: "0",
                        }}
                      >
                        X
                      </button>
                    )}
                  </div>
                  {errors[status.serviceId] && (
                    <div style={{ color: "var(--vscode-editorError-foreground)", fontSize: "11px" }}>{errors[status.serviceId]}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
