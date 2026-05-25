import * as path from "path";
import * as vscode from "vscode";

import {
  getEnableRepoIndexing,
  getMaxContextFiles,
  getMaxFileBytes,
} from "../config";
import { getEditorContext } from "../utils/editor";
import { IndexEntry, RelatedFile, WorkspaceContext } from "../types";
import { ContextMemoryService } from "./contextMemory";

const INDEX_KEY = "openaiAssistant.repoIndex";
const EXCLUDE_PATTERN = "{**/node_modules/**,**/out/**,**/dist/**,**/build/**,**/.git/**,**/.vscode-test/**,**/coverage/**}";

export class WorkspaceContextService {
  private index = new Map<string, IndexEntry>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly memory: ContextMemoryService
  ) {
    const cached = this.context.workspaceState.get<IndexEntry[]>(INDEX_KEY, []);

    for (const entry of cached) {
      this.index.set(entry.path, entry);
    }
  }

  async indexWorkspace(): Promise<IndexEntry[]> {
    if (!getEnableRepoIndexing()) {
      return [];
    }

    const files = await vscode.workspace.findFiles("**/*", EXCLUDE_PATTERN, 500);
    const entries: IndexEntry[] = [];

    for (const uri of files) {
      const entry = await this.createIndexEntry(uri);

      if (entry) {
        entries.push(entry);
      }
    }

    this.index = new Map(entries.map((entry) => [entry.path, entry]));
    await this.context.workspaceState.update(INDEX_KEY, entries);

    return entries;
  }

  async buildWorkspaceContext(userText: string): Promise<WorkspaceContext> {
    const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).map(
      (folder) => folder.uri.fsPath
    );

    let activeFile: string | undefined;
    let activeLanguage: string | undefined;
    let selectedCode: string | undefined;
    let activeFileText: string | undefined;

    try {
      const editorContext = getEditorContext();

      activeFile = editorContext.fileName;
      activeLanguage = editorContext.languageId;
      selectedCode = editorContext.hasSelection ? editorContext.code : undefined;
      activeFileText = limitText(editorContext.code, getMaxFileBytes());
    } catch {
      // Workspace-only requests are allowed.
    }

    const relatedFiles = await this.discoverRelatedFiles(userText, activeFile);
    const agentInstructions = await this.memory.getAgentInstructions();
    const ideContext = await this.memory.getIdeContext();
    const memories = this.memory.getMemories();

    return {
      activeFile,
      activeLanguage,
      selectedCode,
      activeFileText,
      relatedFiles,
      workspaceFolders,
      agentInstructions,
      ideContext,
      memories,
    };
  }

  async discoverRelatedFiles(
    userText: string,
    activeFile?: string
  ): Promise<RelatedFile[]> {
    const maxFiles = getMaxContextFiles();
    const candidates = new Map<string, string>();

    if (this.index.size === 0 && getEnableRepoIndexing()) {
      await this.indexWorkspace();
    }

    const terms = extractSearchTerms(userText);
    const activeBase = activeFile ? path.basename(activeFile, path.extname(activeFile)) : "";

    for (const entry of this.index.values()) {
      if (entry.path === activeFile) {
        continue;
      }

      const normalizedPath = entry.path.toLowerCase();
      const snippet = entry.snippet.toLowerCase();

      if (activeBase && normalizedPath.includes(activeBase.toLowerCase())) {
        candidates.set(entry.path, "Matches active file name");
      }

      if (terms.some((term) => normalizedPath.includes(term) || snippet.includes(term))) {
        candidates.set(entry.path, "Matches request terms");
      }
    }

    const visibleFiles = vscode.window.visibleTextEditors
      .filter((editor) => editor.document.uri.scheme === "file")
      .map((editor) => editor.document.uri.fsPath);

    for (const file of visibleFiles) {
      if (file !== activeFile) {
        candidates.set(file, "Open in editor");
      }
    }

    const related: RelatedFile[] = [];

    for (const [filePath, reason] of candidates) {
      if (related.length >= maxFiles) {
        break;
      }

      const file = await readRelatedFile(filePath, reason);

      if (file) {
        related.push(file);
      }
    }

    return related;
  }

  private async createIndexEntry(uri: vscode.Uri): Promise<IndexEntry | undefined> {
    try {
      const stat = await vscode.workspace.fs.stat(uri);

      if (stat.size > getMaxFileBytes() || stat.type !== vscode.FileType.File) {
        return undefined;
      }

      const bytes = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(bytes).toString("utf8");

      if (text.includes("\u0000")) {
        return undefined;
      }

      return {
        path: uri.fsPath,
        languageId: languageFromPath(uri.fsPath),
        size: stat.size,
        mtime: stat.mtime,
        snippet: limitText(text, 2000),
      };
    } catch {
      return undefined;
    }
  }
}

async function readRelatedFile(
  filePath: string,
  reason: string
): Promise<RelatedFile | undefined> {
  try {
    const uri = vscode.Uri.file(filePath);
    const stat = await vscode.workspace.fs.stat(uri);

    if (stat.size > getMaxFileBytes()) {
      return undefined;
    }

    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(bytes).toString("utf8");

    if (text.includes("\u0000")) {
      return undefined;
    }

    return {
      path: filePath,
      languageId: languageFromPath(filePath),
      content: limitText(text, getMaxFileBytes()),
      reason,
    };
  } catch {
    return undefined;
  }
}

function extractSearchTerms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((term) => term.length >= 4)
    .slice(0, 12);
}

function languageFromPath(filePath: string): string | undefined {
  const extension = path.extname(filePath).slice(1);

  return extension || undefined;
}

function limitText(text: string, maxBytes: number): string {
  const buffer = Buffer.from(text, "utf8");

  if (buffer.byteLength <= maxBytes) {
    return text;
  }

  return buffer.subarray(0, maxBytes).toString("utf8");
}
