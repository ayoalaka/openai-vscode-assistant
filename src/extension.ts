import * as vscode from "vscode";

import { ChatPanel } from "./panels/ChatPanel";
import { askAssistant } from "./commands/askAssistant";
import { explainCode } from "./commands/explainCode";
import { fixCode } from "./commands/fixCode";
import { generateTests } from "./commands/generateTests";
import { resetApiKey } from "./config";

export function activate(context: vscode.ExtensionContext) {
  console.log("OpenAI VS Code Assistant activated.");

  const commands = [
    vscode.commands.registerCommand(
      "openaiAssistant.ask",
      async () => {
        await askAssistant(context);
      }
    ),

    vscode.commands.registerCommand(
      "openaiAssistant.explainCode",
      async () => {
        await explainCode(context);
      }
    ),

    vscode.commands.registerCommand(
      "openaiAssistant.fixCode",
      async () => {
        await fixCode(context);
      }
    ),

    vscode.commands.registerCommand(
      "openaiAssistant.generateTests",
      async () => {
        await generateTests(context);
      }
    ),

    vscode.commands.registerCommand(
      "openaiAssistant.resetApiKey",
      async () => {
        await resetApiKey(context);
      }
    ),

    vscode.commands.registerCommand(
        "openaiAssistant.openChat",
        () => {
            ChatPanel.createOrShow(context);
        }
    ),
  ];

  context.subscriptions.push(...commands);
}

export function deactivate() {}