import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";

import {
  AgentInstruction,
  DiagnosticContext,
  IdeContext,
  LearnedMemory,
} from "../types";

const execFileAsync = promisify(execFile);
const MEMORY_KEY = "openaiAssistant.learnedMemory";
const MAX_MEMORY_ITEMS = 20;
const MAX_INSTRUCTION_BYTES = 12000;
const MAX_DIFF_BYTES = 20000;

const AGENT_INSTRUCTION_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  ".cursorrules",
  ".windsurfrules",
  ".github/copilot-instructions.md",
];

export class ContextMemoryService {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getAgentInstructions(): Promise<AgentInstruction[]> {
    const instructions: AgentInstruction[] = [];

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      for (const relativePath of AGENT_INSTRUCTION_FILES) {
        const uri = vscode.Uri.joinPath(folder.uri, relativePath);
        const content = await readTextFile(uri, MAX_INSTRUCTION_BYTES);

        if (content) {
          instructions.push({
            path: uri.fsPath,
            content,
          });
        }
      }
    }

    return instructions;
  }

  async getIdeContext(): Promise<IdeContext> {
    const openFiles = vscode.window.visibleTextEditors
      .filter((editor) => editor.document.uri.scheme === "file")
      .map((editor) => editor.document.uri.fsPath);

    return {
      openFiles,
      diagnostics: getDiagnostics(openFiles),
      gitDiff: await getGitDiff(),
    };
  }

  getMemories(): LearnedMemory[] {
    return this.context.workspaceState.get<LearnedMemory[]>(MEMORY_KEY, []);
  }

  async rememberAcceptedEdit(summary: string): Promise<void> {
    await this.remember({
      timestamp: Date.now(),
      kind: "accepted-edit",
      summary,
    });
  }

  async rememberRejectedEdit(summary: string): Promise<void> {
    await this.remember({
      timestamp: Date.now(),
      kind: "rejected-edit",
      summary,
    });
  }

  async rememberCommand(summary: string): Promise<void> {
    await this.remember({
      timestamp: Date.now(),
      kind: "command",
      summary,
    });
  }

  private async remember(memory: LearnedMemory): Promise<void> {
    const memories = [memory, ...this.getMemories()].slice(0, MAX_MEMORY_ITEMS);

    await this.context.workspaceState.update(MEMORY_KEY, memories);
  }
}

async function readTextFile(
  uri: vscode.Uri,
  maxBytes: number
): Promise<string | undefined> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);

    if (stat.type !== vscode.FileType.File || stat.size > maxBytes) {
      return undefined;
    }

    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(bytes).toString("utf8");

    if (text.includes("\u0000")) {
      return undefined;
    }

    return text;
  } catch {
    return undefined;
  }
}

function getDiagnostics(openFiles: string[]): DiagnosticContext[] {
  const openFileSet = new Set(openFiles);

  return vscode.languages
    .getDiagnostics()
    .filter(([uri]) => uri.scheme === "file" && openFileSet.has(uri.fsPath))
    .flatMap(([uri, diagnostics]) => {
      return diagnostics.slice(0, 10).map((diagnostic) => ({
        filePath: uri.fsPath,
        severity: severityName(diagnostic.severity),
        message: diagnostic.message,
        line: diagnostic.range.start.line + 1,
      }));
    })
    .slice(0, 30);
}

async function getGitDiff(): Promise<string | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];

  if (!folder) {
    return undefined;
  }

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--", "."],
      {
        cwd: folder.uri.fsPath,
        maxBuffer: MAX_DIFF_BYTES * 2,
      }
    );

    return limitText(stdout, MAX_DIFF_BYTES);
  } catch {
    return undefined;
  }
}

function severityName(severity: vscode.DiagnosticSeverity): string {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return "error";
    case vscode.DiagnosticSeverity.Warning:
      return "warning";
    case vscode.DiagnosticSeverity.Information:
      return "info";
    case vscode.DiagnosticSeverity.Hint:
      return "hint";
  }
}

function limitText(text: string, maxBytes: number): string {
  const buffer = Buffer.from(text, "utf8");

  if (buffer.byteLength <= maxBytes) {
    return text;
  }

  return buffer.subarray(0, maxBytes).toString("utf8");
}
