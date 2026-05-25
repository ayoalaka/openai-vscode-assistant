export interface WorkspaceContext {
  activeFile?: string;
  activeLanguage?: string;
  selectedCode?: string;
  activeFileText?: string;
  relatedFiles: RelatedFile[];
  workspaceFolders: string[];
  agentInstructions: AgentInstruction[];
  ideContext: IdeContext;
  memories: LearnedMemory[];
}

export interface RelatedFile {
  path: string;
  languageId?: string;
  content: string;
  reason: string;
}

export interface ProposedEdit {
  filePath: string;
  replacement: string;
  description?: string;
  createIfMissing?: boolean;
}

export interface EditPlan {
  summary: string;
  edits: ProposedEdit[];
}

export interface ProposedCommand {
  command: string;
  cwd?: string;
  reason?: string;
}

export interface AgentPlan extends EditPlan {
  commands: ProposedCommand[];
}

export interface IndexEntry {
  path: string;
  languageId?: string;
  size: number;
  mtime: number;
  snippet: string;
}

export interface ApiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface AgentInstruction {
  path: string;
  content: string;
}

export interface IdeContext {
  openFiles: string[];
  diagnostics: DiagnosticContext[];
  gitDiff?: string;
}

export interface DiagnosticContext {
  filePath: string;
  severity: string;
  message: string;
  line: number;
}

export interface LearnedMemory {
  timestamp: number;
  kind: "accepted-edit" | "rejected-edit" | "command";
  summary: string;
}
