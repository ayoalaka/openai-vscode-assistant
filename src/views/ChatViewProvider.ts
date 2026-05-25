import * as vscode from "vscode";

import { AssistantService, ChatMessage } from "../services/assistantService";
import { extractBestCode } from "../services/codeExtraction";
import { EditManager } from "../services/editManager";
import { TerminalRunner } from "../services/terminalRunner";
import { WorkspaceContextService } from "../services/workspaceContext";
import { ApiUsage } from "../types";
import { insertTextAtCursor, replaceSelection } from "../utils/editor";

type WebviewMessage = {
  type: string;
  text?: string;
  commandIndex?: number;
};

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "openaiAssistant.chatView";

  private view?: vscode.WebviewView;
  private messages: ChatMessage[] = [];
  private lastAssistantResponse = "";
  private activeAbortController?: AbortController;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly assistantService: AssistantService,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly editManager: EditManager,
    private readonly terminalRunner: TerminalRunner
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      if (message.type === "chat" && message.text) {
        await this.handleChatMessage(message.text);
      }

      if (message.type === "agent-request" && message.text) {
        await this.handleAgentRequest(message.text);
      }

      if (message.type === "stop-generation") {
        this.stopGeneration();
      }

      if (message.type === "insert-last-response") {
        await insertTextAtCursor(extractBestCode(this.lastAssistantResponse));
      }

      if (message.type === "replace-selection") {
        await replaceSelection(extractBestCode(this.lastAssistantResponse));
      }

      if (message.type === "accept-edits") {
        await this.editManager.acceptPendingPlan();
      }

      if (message.type === "reject-edits") {
        await this.editManager.rememberRejectedPlan();
        this.post({ type: "edits-rejected" });
      }

      if (message.type === "run-command") {
        await this.terminalRunner.runCommand(message.commandIndex ?? 0);
      }

      if (message.type === "index-workspace") {
        await this.indexWorkspace();
      }

      if (message.type === "clear-chat") {
        this.messages = [];
        this.lastAssistantResponse = "";
      }
    });
  }

  async promptAgentMode(): Promise<void> {
    const request = await vscode.window.showInputBox({
      prompt: "Describe the agent task",
      placeHolder: "Example: Refactor this feature and update related tests",
      ignoreFocusOut: true,
    });

    if (!request) {
      return;
    }

    await vscode.commands.executeCommand("openaiAssistant.chatView.focus");
    await this.handleAgentRequest(request);
  }

  private async handleChatMessage(userText: string): Promise<void> {
    if (!userText.trim() || this.activeAbortController) {
      return;
    }

    const abortController = this.startGeneration();

    this.messages.push({ role: "user", content: userText });
    this.post({ type: "user", text: userText });
    this.post({ type: "assistant-start", text: "Thinking..." });

    try {
      const assistantResponse = await this.assistantService.streamChat(
        userText,
        this.messages,
        (chunk) => {
          this.post({ type: "assistant-chunk", text: chunk });
        },
        {
          signal: abortController.signal,
          onUsage: (usage) => this.postUsage(usage),
        }
      );

      this.messages.push({ role: "assistant", content: assistantResponse });
      this.lastAssistantResponse = assistantResponse;
      this.post({ type: "assistant-complete" });
    } catch (error) {
      if (isAbortError(error)) {
        this.post({ type: "generation-stopped" });
      } else {
        this.postError(error);
      }
    } finally {
      this.finishGeneration(abortController);
    }
  }

  private async handleAgentRequest(userText: string): Promise<void> {
    if (!userText.trim() || this.activeAbortController) {
      return;
    }

    const abortController = this.startGeneration();

    this.messages.push({ role: "user", content: `[Agent] ${userText}` });
    this.post({ type: "user", text: `[Agent] ${userText}` });
    this.post({ type: "assistant-start", text: "Planning edits..." });

    try {
      const result = await this.assistantService.runAgent(
        userText,
        this.messages,
        (chunk) => {
          this.post({ type: "assistant-chunk", text: chunk });
        },
        {
          signal: abortController.signal,
          onUsage: (usage) => this.postUsage(usage),
        }
      );

      this.messages.push({ role: "assistant", content: result.rawResponse });
      this.lastAssistantResponse = result.rawResponse;

      if (result.plan.edits.length > 0) {
        await this.editManager.setPendingPlan(result.plan);
      }

      this.terminalRunner.setPendingCommands(result.plan.commands);
      this.post({ type: "assistant-complete" });
      this.post({
        type: "proposed-edits",
        text: formatPlanSummary(result.plan.summary, result.plan.edits.length),
      });
      this.post({
        type: "proposed-command",
        text: formatCommandSummary(result.plan.commands),
      });
    } catch (error) {
      if (isAbortError(error)) {
        this.post({ type: "generation-stopped" });
      } else {
        this.postError(error);
      }
    } finally {
      this.finishGeneration(abortController);
    }
  }

  private async indexWorkspace(): Promise<void> {
    this.post({ type: "index-status", text: "Indexing workspace..." });

    try {
      const entries = await this.workspaceContext.indexWorkspace();

      this.post({
        type: "index-status",
        text: `Indexed ${entries.length} workspace file(s).`,
      });
    } catch (error) {
      this.postError(error);
    }
  }

  private startGeneration(): AbortController {
    const abortController = new AbortController();
    this.activeAbortController = abortController;
    this.post({ type: "loading-start" });

    return abortController;
  }

  private finishGeneration(abortController: AbortController): void {
    if (this.activeAbortController === abortController) {
      this.activeAbortController = undefined;
    }

    this.post({ type: "loading-stop" });
  }

  private stopGeneration(): void {
    this.activeAbortController?.abort();
  }

  private postUsage(usage: ApiUsage): void {
    this.post({
      type: "usage",
      text: formatUsage(usage),
    });
  }

  private post(message: Record<string, unknown>): void {
    this.view?.webview.postMessage(message);
  }

  private postError(error: unknown): void {
    this.post({
      type: "assistant-error",
      text: formatError(error),
    });
  }

  private getHtml(): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * {
          box-sizing: border-box;
        }

        :root {
          color-scheme: light dark;
        }

        body {
          margin: 0;
          font-family: var(--vscode-font-family);
          color: var(--vscode-foreground);
          background: var(--vscode-editor-background);
        }
        .app {
          height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 9px 10px;
          border-bottom: 1px solid var(--vscode-panel-border);
          background: var(--vscode-sideBar-background);
        }

        .brand {
          min-width: 0;
        }

        .title {
          font-size: 12px;
          font-weight: 600;
          line-height: 1.2;
        }

        .subtitle {
          font-size: 11px;
          color: var(--vscode-descriptionForeground);
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .top-actions {
          display: flex;
          gap: 4px;
          flex: 0 0 auto;
        }

        #messages {
          flex: 1;
          overflow-y: auto;
          padding: 10px 10px 14px;
        }

        .message {
          margin: 0 0 18px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .message.user {
          align-items: flex-end;
        }

        .message.assistant,
        .message.status {
          align-items: stretch;
        }

        .label-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 18px;
        }

        .label {
          font-size: 11px;
          font-weight: 600;
          color: var(--vscode-descriptionForeground);
        }

        .copy-button {
          display: none;
          padding: 2px 6px;
          font-size: 11px;
          line-height: 1.3;
          background: transparent;
          color: var(--vscode-descriptionForeground);
          border: 1px solid transparent;
        }

        .message:hover .copy-button {
          border-color: var(--vscode-panel-border);
        }

        .assistant .copy-button {
          display: inline-block;
        }

        .bubble {
          line-height: 1.45;
          word-wrap: break-word;
          font-size: 13px;
        }

        .user .bubble {
          white-space: pre-wrap;
          max-width: min(92%, 520px);
          padding: 8px 10px;
          border-radius: 8px;
          color: var(--vscode-input-foreground);
          background: var(--vscode-input-background);
          border: 1px solid var(--vscode-panel-border);
        }

        .assistant .bubble,
        .status .bubble {
          color: var(--vscode-foreground);
          max-width: 100%;
        }

        .status {
          margin-bottom: 10px;
        }

        .status .label-row {
          display: none;
        }

        .status .bubble {
          padding: 7px 9px;
          border-radius: 6px;
          border: 1px solid var(--vscode-panel-border);
          color: var(--vscode-descriptionForeground);
          background: var(--vscode-sideBar-background);
          font-size: 12px;
        }

        .bubble h1,
        .bubble h2,
        .bubble h3 {
          margin: 10px 0 6px;
          line-height: 1.25;
        }

        .bubble h1 {
          font-size: 18px;
        }

        .bubble h2 {
          font-size: 15px;
        }

        .bubble h3 {
          font-size: 13px;
        }

        .bubble p {
          margin: 0 0 8px;
        }

        .bubble p:last-child,
        .bubble ul:last-child,
        .bubble ol:last-child,
        .bubble pre:last-child {
          margin-bottom: 0;
        }

        .bubble ul,
        .bubble ol {
          margin: 0 0 8px 18px;
          padding: 0;
        }

        .bubble pre {
          overflow-x: auto;
          padding: 10px;
          border-radius: 6px;
          background: var(--vscode-textCodeBlock-background);
          border: 1px solid var(--vscode-panel-border);
        }

        .bubble code {
          font-family: var(--vscode-editor-font-family);
          font-size: var(--vscode-editor-font-size);
        }

        .bubble :not(pre) > code {
          padding: 1px 4px;
          border-radius: 4px;
          background: var(--vscode-textCodeBlock-background);
        }

        .bubble blockquote {
          margin: 0 0 8px;
          padding-left: 10px;
          border-left: 3px solid var(--vscode-panel-border);
          opacity: 0.85;
        }

        .composer {
          padding: 10px;
          border-top: 1px solid var(--vscode-panel-border);
          background: var(--vscode-sideBar-background);
        }

        .loading {
          display: none;
          margin: 0 0 8px;
          font-size: 12px;
          color: var(--vscode-descriptionForeground);
        }

        .loading.visible {
          display: block;
        }

        .composer-box {
          border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
          border-radius: 8px;
          background: var(--vscode-input-background);
          overflow: hidden;
        }

        textarea {
          width: 100%;
          min-height: 84px;
          max-height: 220px;
          resize: none;
          color: var(--vscode-input-foreground);
          background: transparent;
          border: 0;
          padding: 10px 10px 6px;
          outline: none;
          font-family: var(--vscode-font-family);
          font-size: 13px;
        }

        .composer-box:focus-within {
          border-color: var(--vscode-focusBorder);
        }

        .composer-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 6px;
          border-top: 1px solid var(--vscode-panel-border);
        }

        .composer-footer {
          padding: 6px 0 0;
          border-top: 0;
        }

        .toolbar-group {
          display: flex;
          align-items: center;
          gap: 4px;
          min-width: 0;
          flex-wrap: wrap;
        }

        button {
          min-width: 0;
          padding: 5px 8px;
          cursor: pointer;
          color: var(--vscode-button-foreground);
          background: var(--vscode-button-background);
          border: none;
          border-radius: 5px;
          font-weight: 500;
          font-size: 12px;
          line-height: 1.3;
        }

        button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        button:hover:not(:disabled) {
          background: var(--vscode-button-hoverBackground);
        }

        button.secondary {
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
        }

        button.secondary:hover:not(:disabled) {
          background: var(--vscode-button-secondaryHoverBackground);
        }

        button.ghost {
          color: var(--vscode-descriptionForeground);
          background: transparent;
          border: 1px solid transparent;
        }

        button.ghost:hover:not(:disabled) {
          color: var(--vscode-foreground);
          background: var(--vscode-toolbar-hoverBackground);
          border-color: var(--vscode-panel-border);
        }

        button.primary {
          padding-inline: 10px;
        }

        #stopButton {
          display: none;
        }

        #stopButton.visible {
          display: inline-block;
        }

        .hint {
          margin-top: 6px;
          font-size: 11px;
          color: var(--vscode-descriptionForeground);
          text-align: right;
        }
      </style>
    </head>

    <body>
      <div class="app">
        <div class="header">
          <div class="brand">
            <div class="title">OpenAI Assistant</div>
            <div class="subtitle">Workspace-aware coding agent</div>
          </div>
          <div class="top-actions">
            <button class="ghost" title="Index workspace" data-busy-control onclick="indexWorkspace()">Index</button>
            <button class="ghost" title="Clear chat" onclick="clearChat()">Clear</button>
          </div>
        </div>

        <div id="messages">
          <div class="message assistant">
            <div class="label-row">
              <div class="label">Assistant</div>
              <button class="secondary copy-button">Copy</button>
            </div>
            <div class="bubble">Ready. Highlight code or ask a question.</div>
          </div>
        </div>

        <div class="composer">
          <div id="loading" class="loading">Thinking...</div>
          <div class="composer-box">
            <textarea id="prompt" placeholder="Ask, edit, or hand off a task..."></textarea>
            <div class="composer-toolbar">
              <div class="toolbar-group">
                <button class="ghost" title="Explain selected code" data-busy-control onclick="quickAsk('Explain the selected code clearly.')">Explain</button>
                <button class="ghost" title="Find and fix bugs" data-busy-control onclick="quickAsk('Find and fix bugs in the selected code.')">Fix</button>
                <button class="ghost" title="Generate tests" data-busy-control onclick="quickAsk('Generate tests for the selected code.')">Tests</button>
              </div>
              <div class="toolbar-group">
                <button class="ghost" title="Insert last code response" data-busy-control onclick="insertLastResponse()">Insert</button>
                <button class="ghost" title="Replace current selection" data-busy-control onclick="replaceSelection()">Replace</button>
                <button id="stopButton" class="secondary" onclick="stopGeneration()">Stop</button>
                <button class="secondary" title="Ask with normal chat" data-busy-control onclick="sendMessage()">Ask</button>
                <button class="primary" title="Plan approved edits" data-busy-control onclick="sendAgent()">Agent</button>
              </div>
            </div>
          </div>
          <div class="composer-toolbar composer-footer">
            <div class="toolbar-group">
              <button class="ghost" title="Accept proposed edits" data-busy-control onclick="acceptEdits()">Accept</button>
              <button class="ghost" title="Reject proposed edits" data-busy-control onclick="rejectEdits()">Reject</button>
              <button class="ghost" title="Run approved terminal command" data-busy-control onclick="runCommand()">Run Cmd</button>
            </div>
            <div class="hint">Enter to ask · Shift+Enter newline</div>
          </div>
        </div>
      </div>

      <script>
        const vscode = acquireVsCodeApi();
        const messages = document.getElementById("messages");
        const loading = document.getElementById("loading");
        const stopButton = document.getElementById("stopButton");
        const busyControls = Array.from(document.querySelectorAll("[data-busy-control]"));
        let currentAssistantBubble = null;
        let currentAssistantRaw = "";

        function appendMessage(role, text) {
          const wrapper = document.createElement("div");
          wrapper.className = "message " + role;

          const labelRow = document.createElement("div");
          labelRow.className = "label-row";

          const label = document.createElement("div");
          label.className = "label";
          label.textContent = role === "user" ? "You" : role === "status" ? "Status" : "Assistant";
          labelRow.appendChild(label);

          if (role === "assistant") {
            const copyButton = document.createElement("button");
            copyButton.className = "secondary copy-button";
            copyButton.textContent = "Copy";
            copyButton.addEventListener("click", () => copyText(wrapper.dataset.raw || ""));
            labelRow.appendChild(copyButton);
          }

          const bubble = document.createElement("div");
          bubble.className = "bubble";
          setBubbleContent(bubble, role, text);

          wrapper.dataset.raw = text;
          wrapper.appendChild(labelRow);
          wrapper.appendChild(bubble);
          messages.appendChild(wrapper);
          messages.scrollTop = messages.scrollHeight;

          return bubble;
        }

        function setBubbleContent(bubble, role, text) {
          if (role === "assistant" || role === "status") {
            bubble.innerHTML = renderMarkdown(text);
          } else {
            bubble.textContent = text;
          }
        }

        function updateAssistantBubble(text) {
          if (!currentAssistantBubble) return;
          const wrapper = currentAssistantBubble.closest(".message");
          if (wrapper) {
            wrapper.dataset.raw = text;
          }
          currentAssistantBubble.innerHTML = renderMarkdown(text || "Thinking...");
          messages.scrollTop = messages.scrollHeight;
        }

        async function copyText(text) {
          try {
            await navigator.clipboard.writeText(text);
          } catch {
            const fallback = document.createElement("textarea");
            fallback.value = text;
            document.body.appendChild(fallback);
            fallback.select();
            document.execCommand("copy");
            fallback.remove();
          }
        }

        function promptText() {
          const input = document.getElementById("prompt");
          const text = input.value.trim();
          input.value = "";
          return text;
        }

        function setBusy(isBusy, text) {
          loading.textContent = text || "Thinking...";
          loading.classList.toggle("visible", isBusy);
          stopButton.classList.toggle("visible", isBusy);
          busyControls.forEach((control) => {
            control.disabled = isBusy;
          });
        }

        function quickAsk(text) {
          vscode.postMessage({ type: "chat", text });
        }

        function sendMessage() {
          const text = promptText();
          if (!text) return;
          vscode.postMessage({ type: "chat", text });
        }

        function sendAgent() {
          const text = promptText();
          if (!text) return;
          vscode.postMessage({ type: "agent-request", text });
        }

        function sendFromKeyboard() {
          const input = document.getElementById("prompt");
          const text = input.value.trim();
          if (!text) return;

          if (/^(agent|plan|edit|change|implement|refactor|fix)\\b/i.test(text)) {
            sendAgent();
          } else {
            sendMessage();
          }
        }

        function stopGeneration() {
          vscode.postMessage({ type: "stop-generation" });
        }

        function insertLastResponse() {
          vscode.postMessage({ type: "insert-last-response" });
        }

        function replaceSelection() {
          vscode.postMessage({ type: "replace-selection" });
        }

        function acceptEdits() {
          vscode.postMessage({ type: "accept-edits" });
        }

        function rejectEdits() {
          vscode.postMessage({ type: "reject-edits" });
        }

        function runCommand() {
          vscode.postMessage({ type: "run-command", commandIndex: 0 });
        }

        function indexWorkspace() {
          vscode.postMessage({ type: "index-workspace" });
        }

        function clearChat() {
          messages.innerHTML = "";
          currentAssistantBubble = null;
          currentAssistantRaw = "";
          appendMessage("assistant", "Chat cleared. Highlight code or ask a new question.");
          vscode.postMessage({ type: "clear-chat" });
        }

        window.addEventListener("message", event => {
          const message = event.data;

          if (message.type === "loading-start") {
            setBusy(true, "Thinking...");
          }

          if (message.type === "loading-stop") {
            setBusy(false);
          }

          if (message.type === "user") {
            appendMessage("user", message.text);
          }

          if (message.type === "assistant-start") {
            currentAssistantRaw = "";
            currentAssistantBubble = appendMessage("assistant", message.text || "Thinking...");
          }

          if (message.type === "assistant-chunk") {
            currentAssistantRaw += message.text;
            updateAssistantBubble(currentAssistantRaw);
          }

          if (message.type === "assistant-complete") {
            updateAssistantBubble(currentAssistantRaw);
          }

          if (message.type === "generation-stopped") {
            appendMessage("status", "Generation stopped.");
          }

          if (message.type === "assistant-error") {
            appendMessage("assistant", "Error: " + message.text);
          }

          if (
            message.type === "proposed-edits" ||
            message.type === "proposed-command" ||
            message.type === "index-status" ||
            message.type === "edits-rejected" ||
            message.type === "usage"
          ) {
            appendMessage("status", message.text || "Done.");
          }
        });

        document.getElementById("prompt").addEventListener("keydown", (event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendFromKeyboard();
          }
        });

        function renderMarkdown(markdown) {
          const blocks = [];
          let rest = markdown || "";
          let index = 0;

          rest = rest.replace(new RegExp("\\x60\\x60\\x60([a-zA-Z0-9_-]*)\\\\n([\\\\s\\\\S]*?)\\x60\\x60\\x60", "g"), (_, language, code) => {
            const token = "%%CODEBLOCK_" + index + "%%";
            blocks.push("<pre><code" + (language ? " data-language=\\"" + escapeHtml(language) + "\\"" : "") + ">" + escapeHtml(code.trim()) + "</code></pre>");
            index += 1;
            return "\\n" + token + "\\n";
          });

          const lines = rest.split(/\\n/);
          const html = [];
          let listMode = null;

          function closeList() {
            if (listMode) {
              html.push("</" + listMode + ">");
              listMode = null;
            }
          }

          for (const line of lines) {
            const trimmed = line.trim();

            if (!trimmed) {
              closeList();
              continue;
            }

            const codeMatch = trimmed.match(/^%%CODEBLOCK_(\\d+)%%$/);
            if (codeMatch) {
              closeList();
              html.push(blocks[Number(codeMatch[1])] || "");
              continue;
            }

            const heading = trimmed.match(/^(#{1,3})\\s+(.+)$/);
            if (heading) {
              closeList();
              const level = heading[1].length;
              html.push("<h" + level + ">" + renderInline(heading[2]) + "</h" + level + ">");
              continue;
            }

            if (/^>\\s+/.test(trimmed)) {
              closeList();
              html.push("<blockquote>" + renderInline(trimmed.replace(/^>\\s+/, "")) + "</blockquote>");
              continue;
            }

            const unordered = trimmed.match(/^[-*]\\s+(.+)$/);
            if (unordered) {
              if (listMode !== "ul") {
                closeList();
                html.push("<ul>");
                listMode = "ul";
              }
              html.push("<li>" + renderInline(unordered[1]) + "</li>");
              continue;
            }

            const ordered = trimmed.match(/^\\d+\\.\\s+(.+)$/);
            if (ordered) {
              if (listMode !== "ol") {
                closeList();
                html.push("<ol>");
                listMode = "ol";
              }
              html.push("<li>" + renderInline(ordered[1]) + "</li>");
              continue;
            }

            closeList();
            html.push("<p>" + renderInline(trimmed) + "</p>");
          }

          closeList();
          return html.join("");
        }

        function renderInline(text) {
          return escapeHtml(text)
            .replace(new RegExp("\`([^\`]+)\`", "g"), "<code>$1</code>")
            .replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>")
            .replace(/\\*([^*]+)\\*/g, "<em>$1</em>")
            .replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)/g, '<a href="$2">$1</a>');
        }

        function escapeHtml(text) {
          return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
        }
      </script>
    </body>
    </html>
    `;
  }
}

function formatPlanSummary(summary: string, editCount: number): string {
  if (editCount === 0) {
    return `${summary}\nNo file edits were proposed.`;
  }

  return `${summary}\n${editCount} file edit(s) proposed. Review the opened diff(s), then Accept or Reject.`;
}

function formatCommandSummary(commands: { command: string; reason?: string }[]): string {
  if (commands.length === 0) {
    return "No terminal commands proposed.";
  }

  return commands
    .map((command, index) => {
      const reason = command.reason ? ` - ${command.reason}` : "";
      return `${index + 1}. ${command.command}${reason}`;
    })
    .join("\n");
}

function formatUsage(usage: ApiUsage): string {
  const cost =
    usage.estimatedCostUsd > 0
      ? ` · est. $${usage.estimatedCostUsd.toFixed(6)}`
      : "";

  return `Usage: ${usage.model} · ${usage.inputTokens} input tokens · ${usage.outputTokens} output tokens · ${usage.totalTokens} total${cost}`;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /aborted|abort/i.test(error.message))
  );
}
