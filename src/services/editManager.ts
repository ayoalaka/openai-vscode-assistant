import * as path from "path";
import * as vscode from "vscode";

import { EditPlan, ProposedEdit } from "../types";
import { ContextMemoryService } from "./contextMemory";

const PREVIEW_SCHEME = "openai-assistant-preview";

export class EditManager implements vscode.TextDocumentContentProvider {
  private pendingPlan?: EditPlan;
  private previewContent = new Map<string, string>();
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();

  readonly onDidChange = this.emitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly memory?: ContextMemoryService
  ) {
    this.context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, this)
    );
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.previewContent.get(uri.toString()) ?? "";
  }

  async setPendingPlan(plan: EditPlan): Promise<void> {
    this.pendingPlan = plan;
    this.previewContent.clear();
    await this.showDiffs(plan.edits);
  }

  getPendingPlan(): EditPlan | undefined {
    return this.pendingPlan;
  }

  rejectPendingPlan(): void {
    this.pendingPlan = undefined;
    this.previewContent.clear();
    vscode.window.showInformationMessage("Rejected proposed assistant edits.");
  }

  async acceptPendingPlan(): Promise<void> {
    if (!this.pendingPlan || this.pendingPlan.edits.length === 0) {
      vscode.window.showInformationMessage("No assistant edits are pending.");
      return;
    }

    const approved = await vscode.window.showWarningMessage(
      `Apply ${this.pendingPlan.edits.length} assistant edit(s)?`,
      { modal: true },
      "Apply"
    );

    if (approved !== "Apply") {
      return;
    }

    const workspaceEdit = await createWorkspaceEdit(this.pendingPlan.edits);
    const applied = await vscode.workspace.applyEdit(workspaceEdit);

    if (applied) {
      await this.memory?.rememberAcceptedEdit(this.pendingPlan.summary);
      this.pendingPlan = undefined;
      this.previewContent.clear();
      vscode.window.showInformationMessage("Applied assistant edits.");
    } else {
      vscode.window.showErrorMessage("Failed to apply assistant edits.");
    }
  }

  async rememberRejectedPlan(): Promise<void> {
    if (this.pendingPlan) {
      await this.memory?.rememberRejectedEdit(this.pendingPlan.summary);
    }

    this.rejectPendingPlan();
  }

  private async showDiffs(edits: ProposedEdit[]): Promise<void> {
    for (const edit of edits.slice(0, 5)) {
      const originalUri = resolveFileUri(edit.filePath);
      const leftUri = (await fileExists(originalUri))
        ? originalUri
        : originalUri.with({
            scheme: PREVIEW_SCHEME,
            path: `${originalUri.path}.original`,
            query: encodeURIComponent(`${originalUri.fsPath}:original`),
          });
      const previewUri = originalUri.with({
        scheme: PREVIEW_SCHEME,
        path: `${originalUri.path}.proposed`,
        query: encodeURIComponent(originalUri.fsPath),
      });

      if (leftUri.scheme === PREVIEW_SCHEME) {
        this.previewContent.set(leftUri.toString(), "");
      }

      this.previewContent.set(previewUri.toString(), edit.replacement);
      this.emitter.fire(leftUri);
      this.emitter.fire(previewUri);

      await vscode.commands.executeCommand(
        "vscode.diff",
        leftUri,
        previewUri,
        `Assistant Edit: ${path.basename(originalUri.fsPath)}`
      );
    }
  }
}

export async function createWorkspaceEdit(
  edits: ProposedEdit[]
): Promise<vscode.WorkspaceEdit> {
  const workspaceEdit = new vscode.WorkspaceEdit();

  for (const edit of edits) {
    const uri = resolveFileUri(edit.filePath);
    const fullRange = await getFullDocumentRange(uri);

    if (fullRange) {
      workspaceEdit.replace(uri, fullRange, edit.replacement);
    } else {
      workspaceEdit.createFile(uri, { ignoreIfExists: true });
      workspaceEdit.insert(uri, new vscode.Position(0, 0), edit.replacement);
    }
  }

  return workspaceEdit;
}

function resolveFileUri(filePath: string): vscode.Uri {
  if (path.isAbsolute(filePath)) {
    return vscode.Uri.file(filePath);
  }

  const folder = vscode.workspace.workspaceFolders?.[0];

  if (!folder) {
    return vscode.Uri.file(filePath);
  }

  return vscode.Uri.joinPath(folder.uri, filePath);
}

async function getFullDocumentRange(uri: vscode.Uri): Promise<vscode.Range | undefined> {
  try {
    const document = await vscode.workspace.openTextDocument(uri);
    const lastLine = document.lineAt(document.lineCount - 1);

    return new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(document.lineCount - 1, lastLine.text.length)
    );
  } catch {
    return undefined;
  }
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);

    return stat.type === vscode.FileType.File;
  } catch {
    return false;
  }
}
