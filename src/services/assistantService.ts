import * as vscode from "vscode";

import { askOpenAI, AssistantTaskType } from "../openaiClient";
import { SYSTEM_PROMPTS } from "../prompts";
import { AgentPlan, ApiUsage, WorkspaceContext } from "../types";
import { parseAgentPlan } from "./codeExtraction";
import { detectTestCommands } from "./testCommands";
import { WorkspaceContextService } from "./workspaceContext";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export class AssistantService {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly workspaceContext: WorkspaceContextService
  ) {}

  async streamChat(
    userText: string,
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    options: {
      signal?: AbortSignal;
      onUsage?: (usage: ApiUsage) => void;
    } = {}
  ): Promise<string> {
    const workspaceContext = await this.workspaceContext.buildWorkspaceContext(
      userText
    );
    const prompt = buildChatPrompt(userText, messages, workspaceContext);

    return askOpenAI(
      this.context,
      prompt,
      SYSTEM_PROMPTS.codingAssistant,
      onChunk,
      detectTaskType(userText),
      options
    );
  }

  async runAgent(
    userText: string,
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    options: {
      signal?: AbortSignal;
      onUsage?: (usage: ApiUsage) => void;
    } = {}
  ): Promise<{ rawResponse: string; plan: AgentPlan }> {
    const workspaceContext = await this.workspaceContext.buildWorkspaceContext(
      userText
    );
    const testCommands = await detectTestCommands();
    const prompt = buildAgentPrompt(
      userText,
      messages,
      workspaceContext,
      testCommands.map((command) => command.command)
    );
    const rawResponse = await askOpenAI(
      this.context,
      prompt,
      SYSTEM_PROMPTS.agentMode,
      onChunk,
      "agent",
      options
    );
    const plan = parseAgentPlan(rawResponse);

    if (plan.commands.length === 0 && testCommands.length > 0) {
      plan.commands.push(testCommands[0]);
    }

    return {
      rawResponse,
      plan,
    };
  }
}

export function detectTaskType(userText: string): AssistantTaskType {
  const lowered = userText.toLowerCase();

  if (
    lowered.includes("debug") ||
    lowered.includes("bug") ||
    lowered.includes("fix") ||
    lowered.includes("error")
  ) {
    return "debug";
  }

  if (lowered.includes("refactor")) {
    return "refactor";
  }

  if (lowered.includes("test")) {
    return "tests";
  }

  if (lowered.includes("explain")) {
    return "explain";
  }

  return "simple";
}

function buildChatPrompt(
  userText: string,
  messages: ChatMessage[],
  workspaceContext: WorkspaceContext
): string {
  return `
Conversation so far:
${formatHistory(messages)}

Workspace context:
${formatWorkspaceContext(workspaceContext)}

Current request:
${userText}
`;
}

function buildAgentPrompt(
  userText: string,
  messages: ChatMessage[],
  workspaceContext: WorkspaceContext,
  testCommands: string[]
): string {
  return `
You are planning approved edits for a VS Code extension.

Return only JSON in this exact shape:
{
  "summary": "short summary",
  "edits": [
    {
      "filePath": "relative/or/absolute/path",
      "replacement": "full new file contents",
      "description": "what changed",
      "createIfMissing": false
    }
  ],
  "commands": [
    {
      "command": "npm test",
      "cwd": "optional working directory",
      "reason": "why to run it"
    }
  ]
}

Rules:
- Propose full-file replacements for edited files.
- Do not claim edits were applied.
- Include terminal or test commands only when useful; they require approval.
- Prefer existing project style.

Conversation so far:
${formatHistory(messages)}

Workspace context:
${formatWorkspaceContext(workspaceContext)}

Detected test commands:
${testCommands.length > 0 ? testCommands.join("\n") : "None"}

User request:
${userText}
`;
}

function formatHistory(messages: ChatMessage[]): string {
  return messages
    .slice(-8)
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join("\n\n");
}

function formatWorkspaceContext(context: WorkspaceContext): string {
  const activeFile = context.activeFile
    ? `
Active file: ${context.activeFile}
Language: ${context.activeLanguage ?? "unknown"}
Selected code:
${context.selectedCode ?? "None"}
Active file text:
\`\`\`${context.activeLanguage ?? ""}
${context.activeFileText ?? ""}
\`\`\`
`
    : "No active editor context.";

  const related = context.relatedFiles
    .map((file) => {
      return `
Related file: ${file.path}
Reason: ${file.reason}
\`\`\`${file.languageId ?? ""}
${file.content}
\`\`\`
`;
    })
    .join("\n");
  const agentInstructions = context.agentInstructions
    .map((instruction) => {
      return `
Agent instruction file: ${instruction.path}
\`\`\`md
${instruction.content}
\`\`\`
`;
    })
    .join("\n");
  const diagnostics = context.ideContext.diagnostics
    .map((diagnostic) => {
      return `${diagnostic.severity.toUpperCase()} ${diagnostic.filePath}:${diagnostic.line} ${diagnostic.message}`;
    })
    .join("\n");
  const memories = context.memories
    .map((memory) => {
      return `${new Date(memory.timestamp).toISOString()} ${memory.kind}: ${memory.summary}`;
    })
    .join("\n");

  return `
Workspace folders:
${context.workspaceFolders.join("\n") || "None"}

Agent/project instructions:
${agentInstructions || "None"}

IDE context:
Open files:
${context.ideContext.openFiles.join("\n") || "None"}

Diagnostics:
${diagnostics || "None"}

Git diff:
\`\`\`diff
${context.ideContext.gitDiff || "None"}
\`\`\`

Learned memory:
${memories || "None"}

${activeFile}

Related files:
${related || "None"}
`;
}
