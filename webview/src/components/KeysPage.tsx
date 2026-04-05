import { useEffect, useMemo, useState } from "react";
import type { KeyServiceId, KeyStatusSummary } from "../types";
import { postMessage } from "../vscode";

interface KeysPageProps {
  statuses: KeyStatusSummary[];
  focusServiceId?: KeyServiceId | null;
  projectIdSetting: string | null;
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

export function KeysPage({ statuses, focusServiceId, projectIdSetting }: KeysPageProps) {
  const [expandedServiceId, setExpandedServiceId] = useState<KeyServiceId | null>(focusServiceId ?? null);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [projectIdDraft, setProjectIdDraft] = useState("");
  const [projectIdFocused, setProjectIdFocused] = useState(false);

  useEffect(() => {
    if (focusServiceId) {
      setExpandedServiceId(focusServiceId);
    }
  }, [focusServiceId]);

  useEffect(() => {
    if (!projectIdFocused) {
      setProjectIdDraft(projectIdSetting ?? "");
    }
  }, [projectIdFocused, projectIdSetting]);

  const sortedStatuses = useMemo(() => {
    return statuses.filter((status) => status.serviceId === "recost");
  }, [statuses]);

  const saveAndCollapse = (serviceId: KeyServiceId) => {
    const value = (draftValues[serviceId] ?? "").trim();
    if (value) {
      setErrors((prev) => ({ ...prev, [serviceId]: "" }));
      postMessage({ type: "setKey", serviceId, value });
      setDraftValues((prev) => ({ ...prev, [serviceId]: "" }));
    }
    setExpandedServiceId((prev) => (prev === serviceId ? null : serviceId));
  };

  const saveProjectId = () => {
    const trimmed = projectIdDraft.trim();
    if (trimmed) {
      postMessage({ type: "setProjectId", value: trimmed });
      setProjectIdDraft(trimmed);
      return;
    }
    if (projectIdSetting) {
      postMessage({ type: "clearProjectId" });
    }
    setProjectIdDraft("");
  };

  return (
    <div className="eco-scroll-invisible" style={{ flex: 1, overflowY: "auto", padding: "16px", minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <div style={{ fontSize: "15px", fontWeight: 600, marginBottom: "4px" }}>Keys</div>
          <p style={{ margin: 0, color: "var(--vscode-descriptionForeground)", fontSize: "12px", lineHeight: 1.5 }}>
            Manage your ReCost API key here. Keys are saved when you collapse the row.
          </p>
        </div>

        <div
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
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
            <div style={{ fontSize: "13px", fontWeight: 600 }}>Project ID</div>
            <div style={{ color: "var(--vscode-descriptionForeground)", fontSize: "11px" }}>
              Optional per-workspace override for remote scan uploads.
            </div>
          </div>

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
              type="text"
              value={projectIdDraft}
              onFocus={() => setProjectIdFocused(true)}
              onBlur={() => {
                setProjectIdFocused(false);
                saveProjectId();
              }}
              onChange={(event) => {
                setProjectIdDraft(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setProjectIdDraft(projectIdSetting ?? "");
                  setProjectIdFocused(false);
                  (event.currentTarget as HTMLInputElement).blur();
                }
                if (event.key === "Enter") {
                  (event.currentTarget as HTMLInputElement).blur();
                }
              }}
              placeholder="Paste project ID"
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
            {projectIdSetting && (
              <button
                onClick={() => {
                  setProjectIdDraft("");
                  setProjectIdFocused(false);
                  postMessage({ type: "clearProjectId" });
                }}
                title="Clear saved Project ID"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "16px",
                  minWidth: "16px",
                  height: "16px",
                  padding: "0",
                  border: "none",
                  borderRadius: "3px",
                  background: "transparent",
                  color: "var(--vscode-descriptionForeground)",
                  cursor: "pointer",
                  opacity: 0.5,
                  transition: "opacity 0.15s, background 0.15s",
                  flexShrink: 0,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.opacity = "1";
                  (e.currentTarget as HTMLButtonElement).style.background = "color-mix(in srgb, var(--vscode-errorForeground, #f14c4c) 12%, transparent)";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--vscode-errorForeground, #f14c4c)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.opacity = "0.5";
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--vscode-descriptionForeground)";
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>
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
                onClick={() => saveAndCollapse(status.serviceId)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  alignItems: "flex-start",
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
                    className="eco-chevron"
                    style={{
                      fontSize: "15px",
                      transform: isExpanded ? "rotate(0deg)" : "rotate(90deg)",
                      color: "var(--vscode-descriptionForeground)",
                    }}
                  >
                    ▾
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
                      type={draftValues[status.serviceId + "__focused"] ? "password" : "text"}
                      value={draftValues[status.serviceId + "__focused"] ? (draftValues[status.serviceId] ?? "") : (status.maskedPreview ?? "")}
                      onFocus={() => {
                        setDraftValues((prev) => ({ ...prev, [status.serviceId + "__focused"]: "1", [status.serviceId]: "" }));
                      }}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setDraftValues((prev) => ({ ...prev, [status.serviceId]: nextValue }));
                        setErrors((prev) => ({ ...prev, [status.serviceId]: "" }));
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setDraftValues((prev) => ({ ...prev, [status.serviceId]: "", [status.serviceId + "__focused"]: "" }));
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
                        onClick={() => postMessage({ type: "clearKey", serviceId: status.serviceId })}
                        title="Delete saved key"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "16px",
                          minWidth: "16px",
                          height: "16px",
                          padding: "0",
                          border: "none",
                          borderRadius: "3px",
                          background: "transparent",
                          color: "var(--vscode-descriptionForeground)",
                          cursor: "pointer",
                          opacity: 0.5,
                          transition: "opacity 0.15s, background 0.15s",
                          flexShrink: 0,
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLButtonElement).style.opacity = "1";
                          (e.currentTarget as HTMLButtonElement).style.background = "color-mix(in srgb, var(--vscode-errorForeground, #f14c4c) 12%, transparent)";
                          (e.currentTarget as HTMLButtonElement).style.color = "var(--vscode-errorForeground, #f14c4c)";
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLButtonElement).style.opacity = "0.5";
                          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                          (e.currentTarget as HTMLButtonElement).style.color = "var(--vscode-descriptionForeground)";
                        }}
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
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
