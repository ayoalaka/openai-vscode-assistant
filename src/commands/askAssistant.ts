import * as vscode from "vscode";

import { askOpenAI } from "../openaiClient";
import { SYSTEM_PROMPTS } from "../prompts";
import {
  getEditorContext,
  buildCodeContextPrompt,
} from "../utils/editor";
import {
  showAssistantResponse,
  showError,
} from "../utils/output";

export async function askAssistant(
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    const question = await vscode.window.showInputBox({
      prompt: "Ask your coding assistant a question",
      placeHolder: "Example: Refactor this code or explain this error",
      ignoreFocusOut: true,
    });

    if (!question) {
      return;
    }

    let prompt = question;

    try {
      const editorContext = getEditorContext();

      prompt = buildCodeContextPrompt(
        question,
        editorContext
      );
    } catch {
      prompt = question;
    }

    const response = await askOpenAI(
      context,
      prompt,
      SYSTEM_PROMPTS.codingAssistant
    );

    showAssistantResponse("Assistant Response", response);
  } catch (error) {
    vscode.window.showErrorMessage("Assistant request failed.");
    showError("Assistant request failed.", error);
  }
}