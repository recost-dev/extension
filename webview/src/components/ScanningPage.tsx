import { LeafIcon } from "./LeafIcon";

interface ScanningPageProps {
  files: string[];
  currentIndex: number;
  endpointCount: number;
  total: number;
  error?: string;
  onDismissError?: () => void;
}

export function ScanningPage({ files, currentIndex, endpointCount, total, error, onDismissError }: ScanningPageProps) {
  const progress = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;
  const currentFile = files[currentIndex] || "";

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
          <div
            style={{
              height: "100%",
              background: "#4caf50",
              width: `${progress}%`,
              transition: "width 0.3s ease",
            }}
          />
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
          {currentFile}
        </p>

        <p style={{ marginTop: "20px", color: "var(--vscode-descriptionForeground)" }}>
          {endpointCount > 0 ? `${endpointCount} endpoints found` : "Scanning..."}
        </p>
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
