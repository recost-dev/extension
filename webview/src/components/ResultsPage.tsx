import { useState } from "react";
import { Markdown } from "./Markdown";
import type { Suggestion, ScanSummary, SuggestionContext, EndpointRecord } from "../types";
import { postMessage } from "../vscode";

interface ResultsPageProps {
  suggestions: Suggestion[];
  summary: ScanSummary;
  endpoints: EndpointRecord[];
  aiReviewRunning: boolean;
  aiReviewStage: string;
  aiReviewError: string;
  aiReviewStats: { added: number; filtered: number } | null;
  onAskAI: (context: SuggestionContext) => void;
}

function formatCost(n: number): string {
  if (n < 0.01) return '<$0.01';
  if (n >= 1_000) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$${n.toFixed(2)}`;
}

const typeLabels: Record<string, string> = {
  n_plus_one: "n+1",
  cache: "cache",
  batch: "batch",
  redundancy: "redundancy",
  rate_limit: "rate-limit",
  concurrency_control: "concurrency",
  retry_storm: "retry storm",
  event_amplification: "event amp",
  sequential: "sequential",
};

const PROVIDER_COLORS: Record<string, string> = {
  openai: "var(--vscode-charts-green)",
  anthropic: "var(--vscode-charts-orange)",
  stripe: "var(--vscode-charts-purple)",
  supabase: "var(--vscode-charts-green)",
  firebase: "var(--vscode-charts-yellow)",
  sendgrid: "var(--vscode-charts-blue)",
  twilio: "var(--vscode-charts-red)",
};

const FREQUENCY_TOOLTIPS: Record<string, string> = {
  "bounded-loop": "This call is inside a loop iterating over a collection",
  "unbounded-loop": "This call is inside a loop with no fixed bound",
  parallel: "This call runs in parallel via Promise.all or similar",
  polling: "This call runs on a timer interval",
  conditional: "This call is inside a conditional branch",
  "cache-guarded": "This call is guarded by a cache check",
};

const COST_MODEL_TOOLTIPS: Record<string, string> = {
  per_token: "Priced per input/output token",
  per_transaction: "Fixed fee + percentage per transaction",
  per_request: "Fixed price per API request",
  free: "No charge for this call",
};

function providerColor(provider: string): string {
  return PROVIDER_COLORS[provider.toLowerCase()] ?? "var(--vscode-descriptionForeground)";
}

function extractCode(raw: string): { code: string; language: string } {
  const fenced = raw.match(/^```(\w*)\n([\s\S]*?)```\s*$/);
  if (fenced) return { language: fenced[1], code: fenced[2].trim() };
  return { language: "", code: raw.trim() };
}

function resolveSuggestionTarget(
  suggestion: Suggestion,
  endpoints: EndpointRecord[]
): { file?: string; line?: number } {
  if (suggestion.targetLine && suggestion.affectedFiles.length > 0) {
    return { file: suggestion.affectedFiles[0], line: suggestion.targetLine };
  }

  for (const endpointId of suggestion.affectedEndpoints) {
    const endpoint = endpoints.find((ep) => ep.id === endpointId);
    if (!endpoint) continue;

    for (const preferredFile of suggestion.affectedFiles) {
      const match = endpoint.callSites.find((site) => site.file === preferredFile);
      if (match) return { file: match.file, line: match.line };
    }

    if (endpoint.callSites.length > 0) {
      const first = endpoint.callSites[0];
      return { file: first.file, line: first.line };
    }
  }

  if (suggestion.affectedFiles.length > 0) {
    return { file: suggestion.affectedFiles[0] };
  }

  return {};
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      style={{
        background: "var(--vscode-badge-background)",
        color: "var(--vscode-badge-foreground)",
        fontSize: "10px",
        padding: "1px 5px",
        borderRadius: "10px",
        fontWeight: 600,
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      {typeLabels[type] ?? type}
    </span>
  );
}

function SourceBadge({ source }: { source?: Suggestion["source"] }) {
  const label = source === "ai" ? "AI" : source === "local-rule" ? "Rule" : "Remote";
  return (
    <span
      style={{
        background: "var(--vscode-editorGroupHeader-tabsBackground)",
        color: "var(--vscode-descriptionForeground)",
        border: "1px solid var(--vscode-panel-border)",
        fontSize: "10px",
        padding: "1px 5px",
        borderRadius: "10px",
        fontWeight: 600,
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function ProviderBadge({ provider }: { provider: string }) {
  const color = providerColor(provider);
  return (
    <span
      style={{
        color,
        background: "var(--vscode-editorGroupHeader-tabsBackground)",
        border: `1px solid ${color}`,
        fontSize: "10px",
        padding: "1px 5px",
        borderRadius: "10px",
        fontWeight: 600,
        flexShrink: 0,
        whiteSpace: "nowrap",
        opacity: 0.9,
      }}
    >
      {provider}
    </span>
  );
}

function CostModelBadge({ costModel }: { costModel?: EndpointRecord["costModel"] }) {
  if (!costModel) return null;
  const map: Record<string, { label: string; color: string }> = {
    per_token: { label: "token", color: "var(--vscode-charts-blue)" },
    per_transaction: { label: "txn", color: "var(--vscode-charts-purple)" },
    per_request: { label: "call", color: "var(--vscode-descriptionForeground)" },
    free: { label: "free", color: "var(--vscode-charts-green)" },
  };
  const entry = map[costModel];
  if (!entry) return null;
  return (
    <span
      title={COST_MODEL_TOOLTIPS[costModel]}
      style={{
        color: entry.color,
        fontSize: "10px",
        padding: "1px 5px",
        borderRadius: "10px",
        border: `1px solid ${entry.color}`,
        flexShrink: 0,
        whiteSpace: "nowrap",
        opacity: 0.85,
      }}
    >
      {entry.label}
    </span>
  );
}

function FrequencyBadge({ frequencyClass }: { frequencyClass?: string }) {
  if (!frequencyClass || frequencyClass === "single") return null;
  const map: Record<string, { label: string; color: string }> = {
    "bounded-loop": { label: "loop", color: "var(--vscode-editorWarning-foreground)" },
    "unbounded-loop": { label: "loop ∞", color: "var(--vscode-editorError-foreground)" },
    parallel: { label: "parallel", color: "var(--vscode-charts-blue)" },
    polling: { label: "polling", color: "var(--vscode-editorError-foreground)" },
    conditional: { label: "if", color: "var(--vscode-descriptionForeground)" },
    "cache-guarded": { label: "cached", color: "var(--vscode-charts-green)" },
  };
  const entry = map[frequencyClass];
  if (!entry) return null;
  return (
    <span
      title={FREQUENCY_TOOLTIPS[frequencyClass]}
      style={{
        color: entry.color,
        fontSize: "10px",
        padding: "1px 5px",
        borderRadius: "10px",
        border: `1px solid ${entry.color}`,
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      {entry.label}
    </span>
  );
}

function CapabilityIndicators({ ep }: { ep: EndpointRecord }) {
  const caps: string[] = [];
  if (ep.streaming) caps.push("stream");
  if (ep.batchCapable) caps.push("batch");
  if (ep.cacheCapable) caps.push("cache");
  if (ep.isMiddleware) caps.push("middleware");
  if (caps.length === 0) return null;
  return (
    <span style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
      {caps.map((c) => (
        <span key={c} style={{ color: "var(--vscode-descriptionForeground)", fontSize: "10px" }}>
          {c}
        </span>
      ))}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence?: number }) {
  if (typeof confidence !== "number") return null;
  const pct = Math.round(confidence * 100);
  const color =
    confidence >= 0.8
      ? "var(--vscode-charts-green)"
      : confidence >= 0.6
      ? "var(--vscode-foreground)"
      : confidence >= 0.4
      ? "var(--vscode-editorWarning-foreground)"
      : "var(--vscode-editorError-foreground)";
  return (
    <span
      title="How certain the detector is about this finding"
      style={{ color, fontSize: "10px", flexShrink: 0, whiteSpace: "nowrap" }}
    >
      {pct}% confidence
    </span>
  );
}

function CodeFix({ codeFix, file, line }: { codeFix: string; file?: string; line?: number }) {
  const [copied, setCopied] = useState(false);
  const { code, language } = extractCode(codeFix);
  if (!code) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        marginTop: "10px",
        borderRadius: "4px",
        overflow: "hidden",
        border: "1px solid var(--vscode-panel-border)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 8px",
          background: "var(--vscode-editorGroupHeader-tabsBackground)",
          borderBottom: "1px solid var(--vscode-panel-border)",
        }}
      >
        <span style={{ color: "var(--vscode-descriptionForeground)", fontSize: "11px" }}>
          {language || "code"}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {file && (
            <button
              className="eco-btn-icon"
              onClick={() => postMessage({ type: "applyFix", code, file, line })}
              title="Apply fix"
              style={{ fontSize: "11px", gap: "3px", display: "flex", alignItems: "center", color: "var(--vscode-textLink-foreground)" }}
            >
              <span className="codicon codicon-check" style={{ fontSize: "11px" }} />
              apply
            </button>
          )}
          <button className="eco-btn-icon" onClick={handleCopy} title="Copy">
            <span className={`codicon ${copied ? "codicon-check" : "codicon-copy"}`} style={{ fontSize: "12px" }} />
          </button>
        </div>
      </div>
      <pre
        style={{
          margin: 0,
          padding: "12px",
          background: "var(--vscode-textCodeBlock-background)",
          fontFamily: "var(--vscode-editor-font-family)",
          fontSize: "var(--vscode-editor-font-size)",
          overflowX: "auto",
          lineHeight: 1.5,
          color: "var(--vscode-editor-foreground, var(--vscode-foreground))",
        }}
      >
        {code}
      </pre>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onAskAI,
  target,
}: {
  suggestion: Suggestion;
  onAskAI: (s: Suggestion) => void;
  target: { file?: string; line?: number };
}) {
  const [expanded, setExpanded] = useState(false);
  const firstLine = suggestion.description.split("\n")[0];
  const descShort = firstLine.length > 90 ? `${firstLine.slice(0, 90)}...` : firstLine;

  return (
    <div className="eco-suggestion">
      <button className="eco-suggestion-header" onClick={() => setExpanded((v) => !v)}>
        <span aria-hidden="true" className={`eco-disclosure${expanded ? " open" : ""}`} />
        <TypeBadge type={suggestion.type} />
        <SourceBadge source={suggestion.source} />
        <ConfidenceBadge confidence={suggestion.confidence} />
        <span style={{ flex: 1, lineHeight: 1.4, overflow: "hidden" }}>{descShort}</span>
        {suggestion.estimatedMonthlySavings > 0 && (
          <span style={{ color: "var(--vscode-charts-green, #4caf50)", fontSize: "11px", flexShrink: 0, whiteSpace: "nowrap" }}>
            {formatCost(suggestion.estimatedMonthlySavings)}/mo
          </span>
        )}
      </button>

      {expanded && (
        <div className="eco-suggestion-body">
          <Markdown content={suggestion.description} />
          {suggestion.evidence && suggestion.evidence.length > 0 && (
            <ul style={{ marginTop: "8px", marginBottom: 0, paddingLeft: "18px" }}>
              {suggestion.evidence.map((item, idx) => (
                <li key={`${suggestion.id}-e-${idx}`} style={{ fontSize: "11px", color: "var(--vscode-descriptionForeground)" }}>
                  {item}
                </li>
              ))}
            </ul>
          )}

          {suggestion.affectedFiles.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "10px" }}>
              {suggestion.affectedFiles.map((f) => (
                <button
                  key={f}
                  className="eco-btn-link"
                  style={{ fontSize: "11px" }}
                  onClick={() => postMessage({ type: "openFile", file: f })}
                >
                  {f}
                </button>
              ))}
            </div>
          )}

          {suggestion.codeFix && <CodeFix codeFix={suggestion.codeFix} file={target.file} line={target.line} />}

          <button
            className="eco-btn-icon"
            onClick={() => onAskAI(suggestion)}
            style={{
              marginTop: "10px",
              gap: "4px",
              display: "flex",
              justifyContent: "flex-start",
              alignItems: "center",
              color: "#ffffff",
              background: "#2ea8ff",
              border: "1px solid #1b8fdf",
              borderRadius: "4px",
              fontSize: "11px",
              fontWeight: 600,
              padding: "5px 10px",
            }}
          >
            Ask AI
          </button>
        </div>
      )}
    </div>
  );
}

function SeverityGroup({
  label,
  suggestions,
  open,
  onToggleGroup,
  onAskAI,
  resolveTarget,
}: {
  label: string;
  suggestions: Suggestion[];
  open: boolean;
  onToggleGroup: () => void;
  onAskAI: (s: Suggestion) => void;
  resolveTarget: (s: Suggestion) => { file?: string; line?: number };
}) {
  if (suggestions.length === 0) return null;

  const color =
    label === "HIGH"
      ? "var(--vscode-editorError-foreground)"
      : label === "MEDIUM"
      ? "var(--vscode-editorWarning-foreground)"
      : "var(--vscode-descriptionForeground)";

  return (
    <div>
      <button className="eco-severity-header" onClick={onToggleGroup} style={{ color }}>
        <span>{label}</span>
        <span style={{ fontSize: "10px", opacity: 0.9 }}>{suggestions.length}</span>
      </button>
      {open &&
        suggestions.map((s) => (
          <SuggestionCard
            key={s.id}
            suggestion={s}
            onAskAI={onAskAI}
            target={resolveTarget(s)}
          />
        ))}
    </div>
  );
}

function EndpointRow({ ep }: { ep: EndpointRecord }) {
  const [expanded, setExpanded] = useState(false);

  const costColor =
    ep.costModel === "free"
      ? "var(--vscode-charts-green)"
      : "var(--vscode-descriptionForeground)";

  const costLabel =
    ep.costModel === "free" ? "Free" : `${formatCost(ep.monthlyCost)}/mo`;

  return (
    <div>
      <button
        className="eco-endpoint-row"
        onClick={() => setExpanded((v) => !v)}
        style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        <span style={{ background: "var(--vscode-badge-background)", color: "var(--vscode-badge-foreground)", fontSize: "10px", padding: "1px 4px", borderRadius: "2px", fontWeight: 700, flexShrink: 0, letterSpacing: "0.04em" }}>
          {ep.method}
        </span>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "11px" }} title={ep.url}>
          {ep.url}
        </span>
        <CapabilityIndicators ep={ep} />
        <ProviderBadge provider={ep.provider} />
        <CostModelBadge costModel={ep.costModel} />
        <span style={{ color: costColor, fontSize: "10px", flexShrink: 0 }}>
          {costLabel}
        </span>
        <FrequencyBadge frequencyClass={ep.frequencyClass} />
        <span
          style={{
            fontSize: "10px",
            flexShrink: 0,
            color:
              ep.status === "redundant" || ep.status === "n_plus_one_risk"
                ? "var(--vscode-editorError-foreground)"
                : ep.status === "cacheable" || ep.status === "batchable" || ep.status === "rate_limit_risk"
                ? "var(--vscode-editorWarning-foreground)"
                : "var(--vscode-descriptionForeground)",
          }}
        >
          {ep.status.replace(/_/g, " ")}
        </span>
      </button>

      {expanded && (
        <div
          style={{
            padding: "6px 12px 8px 24px",
            borderBottom: "1px solid var(--vscode-panel-border)",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          {ep.methodSignature && (
            <span style={{ fontSize: "10px", color: "var(--vscode-descriptionForeground)", fontFamily: "var(--vscode-editor-font-family)" }}>
              {ep.methodSignature}
            </span>
          )}

          {ep.crossFileOrigins && ep.crossFileOrigins.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {ep.crossFileOrigins.map((origin, i) => (
                <button
                  key={i}
                  className="eco-btn-link"
                  style={{ fontSize: "10px" }}
                  onClick={() => postMessage({ type: "openFile", file: origin.file })}
                >
                  via {origin.functionName}
                </button>
              ))}
            </div>
          )}

          {ep.callSites.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginTop: "2px" }}>
              {ep.callSites.map((site, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button
                    className="eco-btn-link"
                    style={{ fontSize: "10px" }}
                    onClick={() => postMessage({ type: "openFile", file: site.file, line: site.line })}
                  >
                    {site.file}:{site.line}
                  </button>
                  {site.frequencyClass && site.frequencyClass !== "single" && (
                    <FrequencyBadge frequencyClass={site.frequencyClass} />
                  )}
                  {site.crossFileOrigin && (
                    <button
                      className="eco-btn-link"
                      style={{ fontSize: "10px" }}
                      onClick={() => postMessage({ type: "openFile", file: site.crossFileOrigin!.file })}
                    >
                      via {site.crossFileOrigin.functionName}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EndpointsList({ endpoints, topBorder }: { endpoints: EndpointRecord[]; topBorder: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={topBorder ? { borderTop: "1px solid var(--vscode-panel-border)" } : undefined}>
      <button className="eco-section-header" onClick={() => setOpen((v) => !v)}>
        Endpoints ({endpoints.length})
      </button>

      {open && endpoints.map((ep) => <EndpointRow key={ep.id} ep={ep} />)}
    </div>
  );
}

function ProviderBreakdown({ endpoints }: { endpoints: EndpointRecord[] }) {
  const counts = new Map<string, number>();
  for (const ep of endpoints) {
    if (ep.provider && ep.provider !== "unknown") {
      counts.set(ep.provider, (counts.get(ep.provider) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <div style={{ fontSize: "10px", color: "var(--vscode-descriptionForeground)", display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "2px" }}>
      {sorted.map(([provider, count], i) => (
        <span key={provider}>
          <span style={{ color: providerColor(provider) }}>{provider}</span>
          {` ×${count}`}
          {i < sorted.length - 1 && <span style={{ opacity: 0.4, marginLeft: "4px" }}>·</span>}
        </span>
      ))}
    </div>
  );
}

export function ResultsPage({
  suggestions,
  summary,
  endpoints,
  aiReviewRunning,
  aiReviewStage,
  aiReviewError,
  aiReviewStats,
  onAskAI,
}: ResultsPageProps) {
  const [openGroups, setOpenGroups] = useState<Record<"HIGH" | "MEDIUM" | "LOW", boolean>>({
    HIGH: true,
    MEDIUM: true,
    LOW: true,
  });

  const handleAskAI = (suggestion: Suggestion) => {
    const target = resolveSuggestionTarget(suggestion, endpoints);
    const files = target.file
      ? [target.file, ...suggestion.affectedFiles.filter((f) => f !== target.file)]
      : suggestion.affectedFiles;
    onAskAI({
      type: suggestion.type,
      description: suggestion.description,
      files,
      codeFix: suggestion.codeFix,
      severity: suggestion.severity,
      estimatedMonthlySavings: suggestion.estimatedMonthlySavings,
      targetFile: target.file,
      targetLine: target.line,
    });
  };

  const high = suggestions.filter((s) => s.severity === "high");
  const medium = suggestions.filter((s) => s.severity === "medium");
  const low = suggestions.filter((s) => s.severity === "low");

  const freeCount = endpoints.filter((ep) => ep.costModel === "free").length;
  const inLoopsCount = endpoints.filter((ep) => ep.frequencyClass && ep.frequencyClass.includes("loop")).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div
        style={{
          padding: "5px 12px",
          borderBottom: "1px solid var(--vscode-panel-border)",
          flexShrink: 0,
          color: "var(--vscode-descriptionForeground)",
          fontSize: "11px",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0" }}>
          {summary.totalEndpoints} endpoints
          <span style={{ margin: "0 5px", opacity: 0.4 }}>|</span>
          {suggestions.length} suggestions
          <span style={{ margin: "0 5px", opacity: 0.4 }}>|</span>
          {formatCost(summary.totalMonthlyCost)}/mo
          {summary.highRiskCount > 0 && (
            <>
              <span style={{ margin: "0 5px", opacity: 0.4 }}>|</span>
              <span style={{ color: "var(--vscode-editorError-foreground)" }}>{summary.highRiskCount} high</span>
            </>
          )}
          {freeCount > 0 && (
            <>
              <span style={{ margin: "0 5px", opacity: 0.4 }}>|</span>
              <span style={{ color: "var(--vscode-charts-green)" }}>{freeCount} free</span>
            </>
          )}
          {inLoopsCount > 0 && (
            <>
              <span style={{ margin: "0 5px", opacity: 0.4 }}>|</span>
              <span style={{ color: "var(--vscode-editorWarning-foreground)" }}>{inLoopsCount} in loops</span>
            </>
          )}
          {aiReviewRunning && (
            <>
              <span style={{ margin: "0 5px", opacity: 0.4 }}>|</span>
              <span>{aiReviewStage || "Running AI review..."}</span>
            </>
          )}
          {!aiReviewRunning && aiReviewStats && (
            <>
              <span style={{ margin: "0 5px", opacity: 0.4 }}>|</span>
              <span>AI added {aiReviewStats.added}, filtered {aiReviewStats.filtered}</span>
            </>
          )}
          {!aiReviewRunning && aiReviewError && (
            <>
              <span style={{ margin: "0 5px", opacity: 0.4 }}>|</span>
              <span style={{ color: "var(--vscode-editorError-foreground)" }}>{aiReviewError}</span>
            </>
          )}
        </div>
        <ProviderBreakdown endpoints={endpoints} />
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {suggestions.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 16px", gap: "8px", color: "var(--vscode-descriptionForeground)" }}>
            <span className="codicon codicon-check" style={{ fontSize: "24px" }} />
            <span>No issues found</span>
          </div>
        ) : (
          <>
            <SeverityGroup
              label="HIGH"
              suggestions={high}
              open={openGroups.HIGH}
              onToggleGroup={() => setOpenGroups((prev) => ({ ...prev, HIGH: !prev.HIGH }))}
              onAskAI={handleAskAI}
              resolveTarget={(s) => resolveSuggestionTarget(s, endpoints)}
            />
            <SeverityGroup
              label="MEDIUM"
              suggestions={medium}
              open={openGroups.MEDIUM}
              onToggleGroup={() => setOpenGroups((prev) => ({ ...prev, MEDIUM: !prev.MEDIUM }))}
              onAskAI={handleAskAI}
              resolveTarget={(s) => resolveSuggestionTarget(s, endpoints)}
            />
            <SeverityGroup
              label="LOW"
              suggestions={low}
              open={openGroups.LOW}
              onToggleGroup={() => setOpenGroups((prev) => ({ ...prev, LOW: !prev.LOW }))}
              onAskAI={handleAskAI}
              resolveTarget={(s) => resolveSuggestionTarget(s, endpoints)}
            />
          </>
        )}

        {endpoints.length === 0 && suggestions.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 16px", gap: "8px", color: "var(--vscode-descriptionForeground)" }}>
            <span className="codicon codicon-search" style={{ fontSize: "24px" }} />
            <span>No API calls detected</span>
            <span style={{ fontSize: "10px", opacity: 0.6 }}>Check your scan glob settings or try re-scanning</span>
          </div>
        )}
        {endpoints.length > 0 && <EndpointsList endpoints={endpoints} topBorder={suggestions.length === 0} />}
        {endpoints.length > 0 && endpoints.every((ep) => ep.costModel === "free") && (
          <div style={{ padding: "8px 12px", fontSize: "11px", color: "var(--vscode-charts-green)", opacity: 0.8 }}>
            All detected calls are free tier
          </div>
        )}
      </div>
    </div>
  );
}
