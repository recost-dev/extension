import { LeafIcon } from "./LeafIcon";

interface ScanningPageProps {
  stage: "scanning" | "analyzing" | "detecting" | "resolving";
  file: string;
  fileIndex: number;
  fileTotal: number;
  error?: string;
  onDismissError?: () => void;
}

function getStageContent(stage: ScanningPageProps["stage"], file: string, fileIndex: number, fileTotal: number) {
  switch (stage) {
    case "scanning":
      return {
        determinate: true,
        progress: fileTotal > 0 ? (fileIndex / fileTotal) * 100 : 0,
        text: file ? `Scanning ${file}` : "Scanning files...",
        subtext: fileTotal > 0 ? `File ${fileIndex} of ${fileTotal}` : "Preparing scan...",
      };
    case "analyzing":
      return {
        determinate: false,
        progress: 100,
        text: "Analyzing API calls...",
        subtext: "",
      };
    case "detecting":
      return {
        determinate: false,
        progress: 100,
        text: "Checking for optimizations...",
        subtext: "",
      };
    case "resolving":
      return {
        determinate: false,
        progress: 100,
        text: "Resolving dependencies...",
        subtext: "",
      };
  }
}

export function ScanningPage({ stage, file, fileIndex, fileTotal, error, onDismissError }: ScanningPageProps) {
  const content = getStageContent(stage, file, fileIndex, fileTotal);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        height: "100%",
        padding: "56px 24px 24px",
      }}
    >
      <style>
        {`
          @keyframes scan-progress-indeterminate {
            0% { transform: translateX(-130%); }
            100% { transform: translateX(220%); }
          }
        `}
      </style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: "320px" }}>
        <LeafIcon size={36} animated />

        <div
          style={{
            width: "100%",
            height: "1px",
            background: "var(--vscode-panel-border)",
            marginTop: "24px",
            overflow: "hidden",
          }}
        >
          {content.determinate ? (
            <div
              style={{
                height: "100%",
                background: "#4caf50",
                width: `${content.progress}%`,
                transition: "width 0.3s ease",
              }}
            />
          ) : (
            <div
              style={{
                width: "42%",
                height: "100%",
                background: "linear-gradient(90deg, transparent 0%, #4caf50 30%, #81c784 70%, transparent 100%)",
                animation: "scan-progress-indeterminate 1.1s ease-in-out infinite",
              }}
            />
          )}
        </div>

        <p
          style={{
            marginTop: "10px",
            width: "100%",
            color: "var(--vscode-descriptionForeground)",
            fontSize: "11px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {content.text}
        </p>

        <p style={{ marginTop: "20px", color: "var(--vscode-descriptionForeground)" }}>{content.subtext || "\u00A0"}</p>
        {error && (
          <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
            <p style={{ margin: 0, color: "var(--vscode-errorForeground)", fontSize: "11px", textAlign: "center" }}>
              {error}
            </p>
            {onDismissError && (
              <button
                onClick={onDismissError}
                style={{
                  padding: "5px 14px",
                  fontSize: "12px",
                  background: "var(--vscode-button-secondaryBackground)",
                  color: "var(--vscode-button-secondaryForeground)",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Continue with local results
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
