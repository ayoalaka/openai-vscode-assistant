export interface WorkspaceContext {
  activeFile?: string;
  activeLanguage?: string;
  selectedCode?: string;
  activeFileText?: string;
  relatedFiles: RelatedFile[];
  workspaceFolders: string[];
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
