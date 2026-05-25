import * as vscode from "vscode";

import { askOpenAI } from "../openaiClient";
import { SYSTEM_PROMPTS } from "../prompts";
import {
  getEditorContext,
  buildCodeContextPrompt,
  insertTextAtCursor,
  replaceSelection,
} from "../utils/editor";

export class ChatPanel {
  public static currentPanel: ChatPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private lastAssistantResponse = "";

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext
  ) {
    this.panel = panel;
    this.context = context;

    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(async (message) => {
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

    this.panel.onDidDispose(() => {
      ChatPanel.currentPanel = undefined;
    });
  }

  static createOrShow(context: vscode.ExtensionContext) {
    if (ChatPanel.currentPanel) {
      ChatPanel.currentPanel.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "openaiAssistantChat",
      "OpenAI Assistant",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
      }
    );

    ChatPanel.currentPanel = new ChatPanel(panel, context);
  }

  private async handleChatMessage(userText: string) {
    if (!userText.trim()) {
      return;
    }

    this.messages.push({
        role: "user",
        content: userText,
    });

    this.panel.webview.postMessage({
      type: "user",
      text: userText,
    });

    this.panel.webview.postMessage({
      type: "assistant-start",
    });

    let currentPrompt = userText;

    try {
        const editorContext = getEditorContext();
        currentPrompt = buildCodeContextPrompt(userText, editorContext);
    } catch {
        currentPrompt = userText;
    }

    const historyText = this.messages
        .slice(-8)
        .map((message) => {
            return `${message.role.toUpperCase()}:\n${message.content}`;
        })
        .join("\n\n");

    const prompt = `
    Conversation so far:
    ${historyText}

    Current request:
    ${currentPrompt}
    `;

    try {
      let assistantResponse = "";
      await askOpenAI(
        this.context,
        prompt,
        SYSTEM_PROMPTS.codingAssistant,
        (chunk) => {
            assistantResponse += chunk;

            this.panel.webview.postMessage({
                type: "assistant-chunk",
                text: chunk,
            });
        }
      );
      this.messages.push({
        role: "assistant",
        content: assistantResponse,
      });
      this.lastAssistantResponse = assistantResponse;
    } catch (error) {
      this.panel.webview.postMessage({
        type: "assistant-error",
        text:
          error instanceof Error
            ? error.message
            : "Unknown error",
      });
    }
  }

  private messages: Array<{
    role: "user" | "assistant";
    content: string;
  }> = []; 

  private getHtml(): string {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
            * {
                box-sizing: border-box;
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
                padding: 16px;
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
                max-width: 90%;
            }

            .assistant .bubble {
                background: var(--vscode-input-background);
                border: 1px solid var(--vscode-panel-border);
                color: var(--vscode-foreground);
                align-self: flex-start;
                max-width: 95%;
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
            
            quick-actions button {
                font-size: 12px;
                padding: 7px 8px;
                background: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
            }

            .quick-actions button:hover {
            background: var(--vscode-button-secondaryHoverBackground);
            }

            .actions {
                margin-top: 8px;
                display: flex;
                gap: 8px;
            }

            button {
                flex: 1;
                padding: 9px 10px;
                cursor: pointer;
                color: var(--vscode-button-foreground);
                background: var(--vscode-button-background);
                border: none;
                border-radius: 7px;
                font-weight: 600;
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
                <div class="subtitle">Ask about selected code, current files, bugs, tests, or refactors.</div>
            </div>

            <div id="messages">
                <div class="message assistant">
                <div class="label">Assistant</div>
                <div class="bubble">Ready. Highlight code or ask a question.</div>
                </div>
            </div>

            <div class="composer">
                <textarea
                id="prompt"
                placeholder="Ask a coding question..."
                ></textarea>

                <div class="quick-actions">
                    <button onclick="quickAsk('Explain the selected code clearly.')">Explain</button>
                    <button onclick="quickAsk('Find and fix bugs in the selected code.')">Fix</button>
                    <button onclick="quickAsk('Generate tests for the selected code.')">Tests</button>
                </div>

                <div class="actions">
                    <button onclick="sendMessage()">Send</button>
                    <button class="secondary" onclick="insertLastResponse()">Insert Last</button>
                    <button class="secondary" onclick="replaceSelection()">Replace Selection</button>
                    <button class="secondary" onclick="clearChat()">Clear</button>
                </div>

                <div class="hint">Enter to send · Shift + Enter for new line</div>
            </div>
            </div>

            <script>
            const vscode = acquireVsCodeApi();
            const messages = document.getElementById("messages");
            let currentAssistantBubble = null;

            function replaceSelection() {
                vscode.postMessage({
                    type: "replace-selection"
                });
            }

            function insertLastResponse() {
                vscode.postMessage({
                    type: "insert-last-response"
                });
            }

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
                vscode.postMessage({
                    type: "chat",
                    text
                });
            }

            function clearChat() {
                messages.innerHTML = "";

                appendMessage(
                    "assistant",
                    "Chat cleared. Highlight code or ask a new question."
                );
            }

            function sendMessage() {
                const input = document.getElementById("prompt");
                const text = input.value.trim();

                if (!text) return;

                vscode.postMessage({
                type: "chat",
                text
                });

                input.value = "";
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

            document
                .getElementById("prompt")
                .addEventListener("keydown", (event) => {
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