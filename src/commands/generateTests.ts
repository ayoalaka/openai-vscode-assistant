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

export async function generateTests(
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    const editorContext = getEditorContext();

    const prompt = buildCodeContextPrompt(
      `
Generate tests for this code.

Requirements:
- Infer the correct testing framework from the language and code
- Include happy path tests
- Include edge cases
- Include failure/error cases
- Explain where the test file should be placed
- Keep tests realistic and runnable
      `,
      editorContext
    );

    const response = await askOpenAI(
      context,
      prompt,
      SYSTEM_PROMPTS.generateTests
    );

    showAssistantResponse("Generated Tests", response);
  } catch (error) {
    vscode.window.showErrorMessage("Failed to generate tests.");
    showError("Failed to generate tests.", error);
  }
}