import * as vscode from "vscode";

import { askOpenAI } from "../openaiClient";
import { SYSTEM_PROMPTS } from "../prompts";
import {
  getEditorContext,
  buildCodeContextPrompt,
  insertTextAtCursor,
  replaceSelection,
} from "../utils/editor";


export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "openaiAssistant.chatView";

  private view?: vscode.WebviewView;
  private messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  private lastAssistantResponse = "";

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.type === "chat") {
        await this.handleChatMessage(message.text);
      }

      if (message.type === "insert-last-response") {
        await insertTextAtCursor(this.lastAssistantResponse);
      }

      if (message.type === "replace-selection") {
        await replaceSelection(this.lastAssistantResponse);
      }
    });
  }

  private async handleChatMessage(userText: string): Promise<void> {
    if (!userText.trim() || !this.view) return;

    this.messages.push({ role: "user", content: userText });

    this.view.webview.postMessage({ type: "user", text: userText });
    this.view.webview.postMessage({ type: "assistant-start" });

    let currentPrompt = userText;

    try {
      const editorContext = getEditorContext();
      currentPrompt = buildCodeContextPrompt(userText, editorContext);
    } catch {
      currentPrompt = userText;
    }

    const historyText = this.messages
      .slice(-8)
      .map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
      .join("\n\n");

    const prompt = `
Conversation so far:
${historyText}

Current request:
${currentPrompt}
`;

    let assistantResponse = "";


 const lowered = userText.toLowerCase();

  const taskType =
    lowered.includes("debug") ||
    lowered.includes("bug") ||
    lowered.includes("fix") ||
    lowered.includes("error")
        ? "debug"
        : lowered.includes("refactor")
        ? "refactor"
        : lowered.includes("test")
            ? "tests"
            : "simple";

    try {
      await askOpenAI(
        this.context,
        prompt,
        SYSTEM_PROMPTS.codingAssistant,
        (chunk) => {
          assistantResponse += chunk;
          this.view?.webview.postMessage({
            type: "assistant-chunk",
            text: chunk,
          });
        }, 
        taskType
      );

      this.messages.push({
        role: "assistant",
        content: assistantResponse,
      });

      this.lastAssistantResponse = assistantResponse;
    } catch (error) {
      this.view.webview.postMessage({
        type: "assistant-error",
        text: error instanceof Error ? error.message : "Unknown error",
      });
    }
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
          border-radius: 10px;
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

        .assistant .bubble {
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

        .quick-actions {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-top: 8px;
        }

        .actions {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-top: 8px;
        }

        button {
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
          <div class="subtitle">Ask about selected code, bugs, tests, or refactors.</div>
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
            <button class="secondary" onclick="insertLastResponse()">Insert</button>
            <button class="secondary" onclick="replaceSelection()">Replace</button>
          </div>

          <div class="actions">
            <button class="secondary" onclick="clearChat()">Clear Chat</button>
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
          label.textContent = role === "user" ? "You" : "Assistant";

          const bubble = document.createElement("div");
          bubble.className = "bubble";
          bubble.textContent = text;

          wrapper.appendChild(label);
          wrapper.appendChild(bubble);
          messages.appendChild(wrapper);
          messages.scrollTop = messages.scrollHeight;

          return bubble;
        }

        function quickAsk(text) {
          vscode.postMessage({ type: "chat", text });
        }

        function sendMessage() {
          const input = document.getElementById("prompt");
          const text = input.value.trim();
          if (!text) return;

          vscode.postMessage({ type: "chat", text });
          input.value = "";
        }

        function insertLastResponse() {
          vscode.postMessage({ type: "insert-last-response" });
        }

        function replaceSelection() {
          vscode.postMessage({ type: "replace-selection" });
        }

        function clearChat() {
          messages.innerHTML = "";
          appendMessage("assistant", "Chat cleared. Highlight code or ask a new question.");
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