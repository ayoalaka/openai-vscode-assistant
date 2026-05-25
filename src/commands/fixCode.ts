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

export async function fixCode(
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    const editorContext = getEditorContext();

    const prompt = buildCodeContextPrompt(
      `
Analyze this code for bugs and problems.

Requirements:
- Find bugs
- Explain root causes
- Return corrected code
- Suggest improvements
- Preserve the original intent
- Prefer minimal safe fixes
      `,
      editorContext
    );

    const response = await askOpenAI(
      context,
      prompt,
      SYSTEM_PROMPTS.fixCode
    );

    showAssistantResponse("Code Fix Suggestions", response);
  } catch (error) {
    vscode.window.showErrorMessage("Failed to analyze code.");
    showError("Failed to analyze code.", error);
  }
}