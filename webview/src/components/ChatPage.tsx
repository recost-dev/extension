import { useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { getVsCodeApi, postMessage } from "../vscode";
import type { ChatProviderOption, HostMessage, KeyStatusSummary, ScanSummary, SuggestionContext } from "../types";

interface ChatPageProps {
  context: SuggestionContext | null;
  summary?: ScanSummary;
  endpointCount?: number;
  keyStatuses: KeyStatusSummary[];
  currentProviderStatus?: KeyStatusSummary;
  chatUsable: boolean;
  onManageKeys: () => void;
}

interface Message {
  role: "ai" | "user";
  content: string;
  applyFix?: {
    code: string;
    file: string;
    line?: number;
  };
}

interface SelectionState {
  provider: string;
  model: string;
}

const DEFAULT_SELECTION: SelectionState = { provider: "recost", model: "recost-ai" };

function toCodeFocusedPrompt(text: string): string {
  return `${text}

Return an actual code solution, not only explanation.
- Include at least one fenced code block.
- Prefer complete replacement snippets for the target file section.
- Keep non-code commentary to 1-2 short lines max.`;
}

function extractFencedCode(raw: string): string | null {
  const match = raw.match(/```(?:\w+)?\n([\s\S]*?)```/);
  return match?.[1]?.trim() || null;
}

function getApplyFixKey(applyFix: { code: string; file: string; line?: number }): string {
  return `${applyFix.file}:${applyFix.line ?? 0}:${applyFix.code}`;
}

function getSavedSelection(): SelectionState {
  const state = getVsCodeApi().getState() as { chatSelection?: SelectionState } | null;
  return state?.chatSelection ?? DEFAULT_SELECTION;
}

function saveSelection(selection: SelectionState) {
  const state = getVsCodeApi().getState() as Record<string, unknown> | null;
  getVsCodeApi().setState({ ...(state ?? {}), chatSelection: selection });
}

function getModelName(providers: ChatProviderOption[], selection: SelectionState): string {
  const provider = providers.find((entry) => entry.id === selection.provider);
  return provider?.models.find((model) => model.id === selection.model)?.displayName ?? selection.model;
}

function buildWelcomeMessage(endpointCount: number, monthlyCost: number): string {
  if (endpointCount > 0) {
    return `Looks like you have **${endpointCount} API endpoint${endpointCount === 1 ? "" : "s"}** (~$${monthlyCost.toFixed(2)}/mo). Ask me anything about your usage, costs, or how to cut them down.`;
  }
  return "No API endpoints turned up in this scan. Try adjusting your scan settings, or ask me anything about API costs and efficiency.";
}

function statusLabel(status?: KeyStatusSummary): string {
  if (!status) return "Ready";
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

export function ChatPage({
  context,
  summary,
  endpointCount = 0,
  currentProviderStatus,
  chatUsable,
  onManageKeys,
}: ChatPageProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", content: buildWelcomeMessage(endpointCount, summary?.totalMonthlyCost ?? 0) },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [selection, setSelection] = useState<SelectionState>(getSavedSelection);
  const [providers, setProviders] = useState<ChatProviderOption[]>([]);
  const [appliedFixKeys, setAppliedFixKeys] = useState<Set<string>>(new Set());
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const autoSentContextRef = useRef<SuggestionContext | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selection.provider),
    [providers, selection.provider]
  );
  const selectedProviderName = selectedProvider?.displayName ?? selection.provider;
  const selectedModelName = getModelName(providers, selection);

  useEffect(() => {
    saveSelection(selection);
    postMessage({ type: "modelChanged", provider: selection.provider, model: selection.model });
  }, [selection]);

  useEffect(() => {
    if (context && context !== autoSentContextRef.current) {
      autoSentContextRef.current = context;
      const targetFile = context.targetFile ?? context.files[0];
      const targetLine = context.targetLine ? ` line ${context.targetLine}` : "";
      const locationHint = targetFile ? ` Target location: ${targetFile}${targetLine}.` : "";
      const autoText = `Analyze this ${context.type} issue and suggest a fix: ${context.description}.${locationHint} Include the proposed code in a fenced code block.`;
      setMessages((prev) => [...prev, { role: "user", content: autoText }]);
      setIsLoading(true);
      postMessage({
        type: "chat",
        text: selection.provider === "recost" ? toCodeFocusedPrompt(autoText) : autoText,
        provider: selection.provider,
        model: selection.model,
      });
    }
  }, [context, selection.model, selection.provider]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as HostMessage;
      switch (msg.type) {
        case "chatConfig":
          setProviders(msg.providers);
          setSelection((prev) => {
            const provider = msg.providers.find((entry) => entry.id === prev.provider) ? prev.provider : msg.selectedProvider;
            const providerEntry = msg.providers.find((entry) => entry.id === provider);
            const model = providerEntry?.models.some((entry) => entry.id === prev.model)
              ? prev.model
              : provider === msg.selectedProvider
              ? msg.selectedModel
              : providerEntry?.models[0]?.id ?? msg.selectedModel;
            return { provider, model };
          });
          break;
        case "chatStreaming":
          setStreamingContent((prev) => prev + msg.chunk);
          break;
        case "chatDone":
          setIsLoading(false);
          setMessages((prev) => {
            const file = context?.targetFile ?? context?.files[0];
            const line = context?.targetLine;
            const code = extractFencedCode(msg.fullContent ?? "") ?? context?.codeFix?.trim();
            return [...prev, { role: "ai", content: msg.fullContent ?? "", applyFix: file && code ? { file, line, code } : undefined }];
          });
          setStreamingContent("");
          break;
        case "chatError":
          setIsLoading(false);
          setStreamingContent("");
          setMessages((prev) => [...prev, { role: "ai", content: `**Error:** ${msg.message}` }]);
          break;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [context]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading, streamingContent]);

  useEffect(() => {
    if (!showModelDropdown) return;
    const handler = (event: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showModelDropdown]);

  const sendChatRequest = (text: string) => {
    if (!chatUsable || isLoading) return;
    const textForModel = selection.provider === "recost" ? toCodeFocusedPrompt(text) : text;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsLoading(true);
    postMessage({ type: "chat", text: textForModel, provider: selection.provider, model: selection.model });
  };

  const handleApplyFix = (applyFix: { code: string; file: string; line?: number }) => {
    const key = getApplyFixKey(applyFix);
    setAppliedFixKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    postMessage({ type: "applyFix", ...applyFix });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--vscode-panel-border)" }}>
        <div style={{ fontSize: "12px", color: "var(--vscode-descriptionForeground)" }}>
          {selectedProviderName} · {selectedModelName}
        </div>
      </div>

      <div
        ref={messagesContainerRef}
        className="eco-scroll-invisible"
        style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "12px", display: "flex", flexDirection: "column", gap: "16px" }}
      >
        {messages.map((msg, index) => (
          <div key={index} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <span style={{ fontSize: "10px", color: "var(--vscode-descriptionForeground)", marginBottom: "4px" }}>
              {msg.role === "user" ? "you" : "recost"}
            </span>
            {msg.role === "user" ? (
              <div style={{ background: "#2e7d32", color: "#ffffff", padding: "8px 12px", borderRadius: "12px 12px 0 12px", maxWidth: "85%", fontSize: "var(--vscode-font-size)", lineHeight: 1.5, wordBreak: "break-word" }}>
                {msg.content}
              </div>
            ) : (
              <div style={{ maxWidth: "100%", width: "100%" }}>
                <Markdown content={msg.content} addCopyButtons />
                {msg.applyFix ? (
                  <button
                    className="eco-btn-primary"
                    onClick={() => handleApplyFix(msg.applyFix!)}
                    disabled={appliedFixKeys.has(getApplyFixKey(msg.applyFix))}
                    style={{ marginTop: "8px", opacity: appliedFixKeys.has(getApplyFixKey(msg.applyFix)) ? 0.6 : 1 }}
                  >
                    {appliedFixKeys.has(getApplyFixKey(msg.applyFix)) ? "Applied" : "Apply Fix"}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ))}

        {selection.provider !== "recost" && !chatUsable && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1px solid var(--vscode-editorWarning-foreground)",
            background: "color-mix(in srgb, var(--vscode-editorWarning-foreground) 10%, transparent)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="codicon codicon-warning" style={{ color: "var(--vscode-editorWarning-foreground)", fontSize: "14px" }} />
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--vscode-editorWarning-foreground)" }}>
                {selectedProviderName} key {statusLabel(currentProviderStatus).toLowerCase()}
              </span>
            </div>
            <span style={{ fontSize: "11px", color: "var(--vscode-foreground)", opacity: 0.85 }}>
              {currentProviderStatus?.message ?? `Configure your ${selectedProviderName} API key to start chatting.`}
            </span>
            <button className="eco-btn-secondary" style={{ alignSelf: "flex-start" }} onClick={onManageKeys}>
              Manage Keys
            </button>
          </div>
        )}

        {isLoading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", maxWidth: "100%", width: "100%" }}>
            <span style={{ fontSize: "10px", color: "var(--vscode-descriptionForeground)", marginBottom: "4px" }}>eco</span>
            {streamingContent ? <Markdown content={streamingContent} /> : <div className="eco-thinking">Thinking</div>}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: "8px 12px", borderTop: "1px solid var(--vscode-panel-border)", flexShrink: 0 }}>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-end", gap: "4px", background: "var(--vscode-input-background)", border: "1.5px solid #4caf50", borderRadius: "10px", padding: "6px 6px 6px 10px", opacity: isLoading || !chatUsable ? 0.6 : 1 }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              event.target.style.height = "auto";
              event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                const text = input.trim();
                if (!text) return;
                setInput("");
                sendChatRequest(text);
              }
            }}
            placeholder={chatUsable ? `Ask a follow-up with ${selectedProviderName}...` : `Configure ${selectedProviderName} before sending chat`}
            disabled={isLoading || !chatUsable}
            rows={1}
            style={{ flex: 1, background: "transparent", color: "var(--vscode-input-foreground)", border: "none", outline: "none", resize: "none", fontFamily: "var(--vscode-font-family)", fontSize: "var(--vscode-font-size)", lineHeight: 1.5, minHeight: "22px", padding: 0 }}
          />

          <div ref={modelDropdownRef} style={{ position: "relative", flexShrink: 0 }}>
            <button
              className="eco-chat-icon-btn"
              onClick={() => !isLoading && setShowModelDropdown((value) => !value)}
              title={`${selectedProviderName} · ${selectedModelName}`}
              style={{ background: showModelDropdown ? "rgba(76,175,80,0.25)" : "transparent", color: "#ffffff" }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 1a1.5 1.5 0 0 1 1.5 1.5V3h2A1.5 1.5 0 0 1 13 4.5v7A1.5 1.5 0 0 1 11.5 13h-7A1.5 1.5 0 0 1 3 11.5v-7A1.5 1.5 0 0 1 4.5 3h2v-.5A1.5 1.5 0 0 1 8 1zm0 1a.5.5 0 0 0-.5.5V3h1v-.5A.5.5 0 0 0 8 2zM5.75 7a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm4.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM6 10.5a.5.5 0 0 0 0 1h4a.5.5 0 0 0 0-1H6z"/>
              </svg>
            </button>
            {showModelDropdown && (
              <div className="eco-scroll-invisible" style={{ position: "absolute", bottom: "calc(100% + 8px)", right: 0, background: "var(--vscode-dropdown-background, var(--vscode-editor-background))", border: "1px solid var(--vscode-dropdown-border, var(--vscode-panel-border))", borderRadius: "8px", boxShadow: "0 4px 20px rgba(0,0,0,0.35)", minWidth: "240px", maxHeight: "320px", overflowY: "auto", zIndex: 100, padding: "4px 0" }}>
                {providers.map((provider, index) => (
                  <div key={provider.id}>
                    {index > 0 && <div style={{ height: "1px", background: "var(--vscode-panel-border)", margin: "3px 0" }} />}
                    <div style={{ padding: "4px 10px 2px", fontSize: "10px", fontWeight: 600, color: "var(--vscode-descriptionForeground)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                      {provider.displayName}
                    </div>
                    {provider.models.map((modelOption) => {
                      const selected = selection.provider === provider.id && selection.model === modelOption.id;
                      return (
                        <button
                          key={`${provider.id}:${modelOption.id}`}
                          onClick={() => {
                            setSelection({ provider: provider.id, model: modelOption.id });
                            setShowModelDropdown(false);
                          }}
                          style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%", padding: "6px 10px", background: selected ? "rgba(76,175,80,0.2)" : "transparent", color: "var(--vscode-foreground)", border: "none", cursor: "pointer", fontSize: "12px", fontFamily: "var(--vscode-font-family)", textAlign: "left" }}
                        >
                          <span style={{ display: "flex", flexDirection: "column" }}>
                            <span>{modelOption.displayName}</span>
                            <span style={{ fontSize: "10px", color: "var(--vscode-descriptionForeground)" }}>{provider.displayName}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            className="eco-chat-icon-btn"
            onClick={() => {
              const text = input.trim();
              if (!text) return;
              setInput("");
              sendChatRequest(text);
            }}
            title="Send"
            style={{ flexShrink: 0, background: "#4caf50", cursor: isLoading || !input.trim() || !chatUsable ? "default" : "pointer", opacity: isLoading || !input.trim() || !chatUsable ? 0.45 : 1, color: "#ffffff" }}
          >
            <svg width="14" height="14" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
              <polygon points="1,5 7,5 7,2 11,6 7,10 7,7 1,7" fill="#ffffff" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
