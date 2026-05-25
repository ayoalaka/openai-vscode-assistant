import * as vscode from "vscode";

import { askAssistant } from "./commands/askAssistant";
import { explainCode } from "./commands/explainCode";
import { fixCode } from "./commands/fixCode";
import { generateTests } from "./commands/generateTests";
import { resetApiKey } from "./config";
import { AssistantService } from "./services/assistantService";
import { EditManager } from "./services/editManager";
import { TerminalRunner } from "./services/terminalRunner";
import { WorkspaceContextService } from "./services/workspaceContext";
import { ChatViewProvider } from "./views/ChatViewProvider";

export function activate(context: vscode.ExtensionContext) {
  console.log("OpenAI VS Code Assistant activated.");

  const workspaceContext = new WorkspaceContextService(context);
  const editManager = new EditManager(context);
  const terminalRunner = new TerminalRunner();
  const assistantService = new AssistantService(context, workspaceContext);
  const chatViewProvider = new ChatViewProvider(
    context,
    assistantService,
    workspaceContext,
    editManager,
    terminalRunner
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      chatViewProvider
    )
  );

  const commands = [
    vscode.commands.registerCommand("openaiAssistant.ask", async () => {
      await askAssistant(context);
    }),

    vscode.commands.registerCommand("openaiAssistant.explainCode", async () => {
      await explainCode(context);
    }),

    vscode.commands.registerCommand("openaiAssistant.fixCode", async () => {
      await fixCode(context);
    }),

    vscode.commands.registerCommand("openaiAssistant.generateTests", async () => {
      await generateTests(context);
    }),

    vscode.commands.registerCommand("openaiAssistant.resetApiKey", async () => {
      await resetApiKey(context);
    }),

    vscode.commands.registerCommand("openaiAssistant.openChat", () => {
      vscode.commands.executeCommand("openaiAssistant.chatView.focus");
    }),

    vscode.commands.registerCommand("openaiAssistant.agentMode", async () => {
      await chatViewProvider.promptAgentMode();
    }),

    vscode.commands.registerCommand("openaiAssistant.acceptEdits", async () => {
      await editManager.acceptPendingPlan();
    }),

    vscode.commands.registerCommand("openaiAssistant.rejectEdits", () => {
      editManager.rejectPendingPlan();
    }),

    vscode.commands.registerCommand(
      "openaiAssistant.runApprovedCommand",
      async () => {
        await terminalRunner.runCommand();
      }
    ),

    vscode.commands.registerCommand("openaiAssistant.indexWorkspace", async () => {
      const entries = await workspaceContext.indexWorkspace();

      vscode.window.showInformationMessage(
        `Indexed ${entries.length} workspace file(s).`
      );
    }),
  ];

  context.subscriptions.push(...commands);
}

export function deactivate() {}
