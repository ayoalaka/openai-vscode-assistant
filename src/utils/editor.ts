import * as vscode from "vscode";

export interface EditorContext {
  code: string;
  fileName: string;
  languageId: string;
  hasSelection: boolean;
}

export function getEditorContext(): EditorContext {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    throw new Error("No active editor found.");
  }

  const document = editor.document;
  const selection = editor.selection;

  const hasSelection = !selection.isEmpty;

  const code = hasSelection
    ? document.getText(selection)
    : document.getText();

  return {
    code,
    fileName: document.fileName,
    languageId: document.languageId,
    hasSelection,
  };
}

export function buildCodeContextPrompt(
  task: string,
  context: EditorContext
): string {
  return `
Task:
${task}

File:
${context.fileName}

Language:
${context.languageId}

User selected code:
${context.hasSelection ? "Yes" : "No, using full file"}

Code:
\`\`\`${context.languageId}
${context.code}
\`\`\`
`;
}