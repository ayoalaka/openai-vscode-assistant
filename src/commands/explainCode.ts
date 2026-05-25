import * as vscode from "vscode";

import { askOpenAI } from "../openaiClient";
import { SYSTEM_PROMPTS } from "../prompts";
import {
  getEditorContext,
  buildCodeContextPrompt,
} from "../utils/editor";
import {
  clearOutput,
  appendOutput,
  showError,
} from "../utils/output";

export async function explainCode(
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    const editorContext =
      getEditorContext();

    const prompt =
      buildCodeContextPrompt(
        "Explain this code clearly.",
        editorContext
      );

    clearOutput();

    appendOutput(
      "## Code Explanation\n\n"
    );

    await askOpenAI(
      context,
      prompt,
      SYSTEM_PROMPTS.explainCode,
      (chunk) => {
        appendOutput(chunk);
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      "Failed to explain code."
    );

    showError(
      "Failed to explain code.",
      error
    );
  }
}