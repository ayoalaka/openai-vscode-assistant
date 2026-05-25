import * as vscode from "vscode";

import { AssistantService, ChatMessage } from "../services/assistantService";
import { extractBestCode } from "../services/codeExtraction";
import { EditManager } from "../services/editManager";
import { TerminalRunner } from "../services/terminalRunner";
import { WorkspaceContextService } from "../services/workspaceContext";
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
        this.editManager.rejectPendingPlan();
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
    if (!userText.trim()) {
      return;
    }

    this.messages.push({ role: "user", content: userText });
    this.post({ type: "user", text: userText });
    this.post({ type: "assistant-start" });

    try {
      const assistantResponse = await this.assistantService.streamChat(
        userText,
        this.messages,
        (chunk) => {
          this.post({ type: "assistant-chunk", text: chunk });
        }
      );

      this.messages.push({ role: "assistant", content: assistantResponse });
      this.lastAssistantResponse = assistantResponse;
    } catch (error) {
      this.postError(error);
    }
  }

  private async handleAgentRequest(userText: string): Promise<void> {
    if (!userText.trim()) {
      return;
    }

    this.messages.push({ role: "user", content: `[Agent] ${userText}` });
    this.post({ type: "user", text: `[Agent] ${userText}` });
    this.post({ type: "assistant-start" });

    try {
      const result = await this.assistantService.runAgent(
        userText,
        this.messages,
        (chunk) => {
          this.post({ type: "assistant-chunk", text: chunk });
        }
      );

      this.messages.push({ role: "assistant", content: result.rawResponse });
      this.lastAssistantResponse = result.rawResponse;

      if (result.plan.edits.length > 0) {
        await this.editManager.setPendingPlan(result.plan);
      }

      this.terminalRunner.setPendingCommands(result.plan.commands);
      this.post({
        type: "proposed-edits",
        text: formatPlanSummary(result.plan.summary, result.plan.edits.length),
      });
      this.post({
        type: "proposed-command",
        text: formatCommandSummary(result.plan.commands),
      });
    } catch (error) {
      this.postError(error);
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

  private post(message: Record<string, unknown>): void {
    this.view?.webview.postMessage(message);
  }

  private postError(error: unknown): void {
    this.post({
      type: "assistant-error",
      text: error instanceof Error ? error.message : "Unknown error",
    });
  }

  private getHtml(): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { box-sizing: border-box; }
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
          padding: 14px 16px;
          border-bottom: 1px solid var(--vscode-panel-border);
          background: var(--vscode-sideBar-background);
        }
        .title {
          font-size: 14px;
          font-weight: 700;
        }
        .subtitle {
          margin-top: 4px;
          font-size: 11px;
          opacity: 0.7;
        }
        #messages {
          flex: 1;
          overflow-y: auto;
          padding: 14px;
        }
        .message {
          margin-bottom: 14px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .label {
          font-size: 11px;
          font-weight: 700;
          opacity: 0.75;
        }
        .bubble {
          padding: 10px 12px;
          border-radius: 8px;
          line-height: 1.45;
          white-space: pre-wrap;
          word-wrap: break-word;
          font-size: 13px;
        }
        .user .bubble {
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          align-self: flex-end;
          max-width: 92%;
        }
        .assistant .bubble,
        .status .bubble {
          background: var(--vscode-input-background);
          border: 1px solid var(--vscode-panel-border);
          color: var(--vscode-foreground);
          align-self: flex-start;
          max-width: 96%;
        }
        .composer {
          padding: 12px;
          border-top: 1px solid var(--vscode-panel-border);
          background: var(--vscode-sideBar-background);
        }
        textarea {
          width: 100%;
          min-height: 78px;
          max-height: 180px;
          resize: vertical;
          color: var(--vscode-input-foreground);
          background: var(--vscode-input-background);
          border: 1px solid var(--vscode-input-border);
          border-radius: 8px;
          padding: 10px;
          outline: none;
          font-family: var(--vscode-font-family);
          font-size: 13px;
        }
        textarea:focus {
          border-color: var(--vscode-focusBorder);
        }
        .quick-actions,
        .actions {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin-top: 8px;
        }
        button {
          min-width: 0;
          padding: 8px;
          cursor: pointer;
          color: var(--vscode-button-foreground);
          background: var(--vscode-button-background);
          border: none;
          border-radius: 7px;
          font-weight: 600;
          font-size: 12px;
        }
        button:hover {
          background: var(--vscode-button-hoverBackground);
        }
        button.secondary {
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover {
          background: var(--vscode-button-secondaryHoverBackground);
        }
        .hint {
          margin-top: 8px;
          font-size: 11px;
          opacity: 0.65;
          text-align: center;
        }
      </style>
    </head>

    <body>
      <div class="app">
        <div class="header">
          <div class="title">OpenAI Assistant</div>
          <div class="subtitle">Workspace context, approved edits, and commands.</div>
        </div>

        <div id="messages">
          <div class="message assistant">
            <div class="label">Assistant</div>
            <div class="bubble">Ready. Highlight code or ask a question.</div>
          </div>
        </div>

        <div class="composer">
          <textarea id="prompt" placeholder="Ask a coding question..."></textarea>

          <div class="quick-actions">
            <button onclick="quickAsk('Explain the selected code clearly.')">Explain</button>
            <button onclick="quickAsk('Find and fix bugs in the selected code.')">Fix</button>
            <button onclick="quickAsk('Generate tests for the selected code.')">Tests</button>
          </div>

          <div class="actions">
            <button onclick="sendMessage()">Send</button>
            <button onclick="sendAgent()">Agent</button>
            <button class="secondary" onclick="indexWorkspace()">Index</button>
          </div>

          <div class="actions">
            <button class="secondary" onclick="insertLastResponse()">Insert</button>
            <button class="secondary" onclick="replaceSelection()">Replace</button>
            <button class="secondary" onclick="clearChat()">Clear</button>
          </div>

          <div class="actions">
            <button class="secondary" onclick="acceptEdits()">Accept</button>
            <button class="secondary" onclick="rejectEdits()">Reject</button>
            <button class="secondary" onclick="runCommand()">Run Cmd</button>
          </div>

          <div class="hint">Enter to send · Shift + Enter for new line</div>
        </div>
      </div>

      <script>
        const vscode = acquireVsCodeApi();
        const messages = document.getElementById("messages");
        let currentAssistantBubble = null;

        function appendMessage(role, text) {
          const wrapper = document.createElement("div");
          wrapper.className = "message " + role;

          const label = document.createElement("div");
          label.className = "label";
          label.textContent = role === "user" ? "You" : role === "status" ? "Status" : "Assistant";

          const bubble = document.createElement("div");
          bubble.className = "bubble";
          bubble.textContent = text;

          wrapper.appendChild(label);
          wrapper.appendChild(bubble);
          messages.appendChild(wrapper);
          messages.scrollTop = messages.scrollHeight;

          return bubble;
        }

        function promptText() {
          const input = document.getElementById("prompt");
          const text = input.value.trim();
          input.value = "";
          return text;
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
          appendMessage("assistant", "Chat cleared. Highlight code or ask a new question.");
          vscode.postMessage({ type: "clear-chat" });
        }

        window.addEventListener("message", event => {
          const message = event.data;

          if (message.type === "user") {
            appendMessage("user", message.text);
          }

          if (message.type === "assistant-start") {
            currentAssistantBubble = appendMessage("assistant", "");
          }

          if (message.type === "assistant-chunk") {
            if (currentAssistantBubble) {
              currentAssistantBubble.textContent += message.text;
              messages.scrollTop = messages.scrollHeight;
            }
          }

          if (message.type === "assistant-error") {
            appendMessage("assistant", "Error: " + message.text);
          }

          if (
            message.type === "proposed-edits" ||
            message.type === "proposed-command" ||
            message.type === "index-status" ||
            message.type === "edits-rejected"
          ) {
            appendMessage("status", message.text || "Done.");
          }
        });

        document.getElementById("prompt").addEventListener("keydown", (event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
          }
        });
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
