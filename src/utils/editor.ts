import * as vscode from "vscode";

export interface EditorContext {
  code: string;
  fileName: string;
  languageId: string;
  hasSelection: boolean;
}

export function getEditorContext(): EditorContext {
  const editor = getBestEditor();

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

export async function insertTextAtCursor(text: string): Promise<void> {
  const editor = getBestEditor();

  if (!editor) {
    throw new Error("No active editor found.");
  }

  await editor.edit((editBuilder) => {
    editBuilder.insert(editor.selection.active, text);
  });
}

export async function replaceSelection(text: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    throw new Error("No active editor found.");
  }

  await editor.edit((editBuilder) => {
    editBuilder.replace(editor.selection, text);
  });
}

let lastEditor: vscode.TextEditor | undefined;

vscode.window.onDidChangeActiveTextEditor((editor) => {
  if (editor && editor.document.uri.scheme === "file") {
    lastEditor = editor;
  }
});

function getBestEditor(): vscode.TextEditor {
  const active = vscode.window.activeTextEditor;

  if (active && active.document.uri.scheme === "file") {
    lastEditor = active;
    return active;
  }

  if (lastEditor) {
    return lastEditor;
  }

  const visibleEditor = vscode.window.visibleTextEditors.find(
    (editor) => editor.document.uri.scheme === "file"
  );

  if (visibleEditor) {
    lastEditor = visibleEditor;
    return visibleEditor;
  }

  throw new Error("No active editor found.");
}