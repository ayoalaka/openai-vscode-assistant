import { AgentPlan, ProposedEdit } from "../types";

const jsonBlockPattern = /```(?:json)?\s*([\s\S]*?)```/gi;
const codeBlockPattern = /```[a-zA-Z0-9_-]*\s*([\s\S]*?)```/g;

export function extractBestCode(response: string): string {
  const structuredEdits = extractStructuredEdits(response);

  if (structuredEdits.length === 1) {
    return structuredEdits[0].replacement.trim();
  }

  const codeBlocks = [...response.matchAll(codeBlockPattern)]
    .map((match) => match[1].trim())
    .filter(Boolean);

  if (codeBlocks.length > 0) {
    return codeBlocks.join("\n\n");
  }

  return response.trim();
}

export function extractStructuredEdits(response: string): ProposedEdit[] {
  const parsed = parseJsonCandidates(response);

  for (const candidate of parsed) {
    const edits = normalizeEdits(candidate);

    if (edits.length > 0) {
      return edits;
    }
  }

  return [];
}

export function parseAgentPlan(response: string): AgentPlan {
  const parsed = parseJsonCandidates(response);

  for (const candidate of parsed) {
    const objectCandidate = asRecord(candidate);
    const edits = normalizeEdits(candidate);
    const commands = Array.isArray(objectCandidate?.commands)
      ? objectCandidate.commands
          .filter((command: unknown) => {
            return (
              typeof command === "object" &&
              command !== null &&
              typeof (command as { command?: unknown }).command === "string"
            );
          })
          .map((command: unknown) => {
            const proposed = command as {
              command: string;
              cwd?: string;
              reason?: string;
            };

            return {
              command: proposed.command,
              cwd: proposed.cwd,
              reason: proposed.reason,
            };
          })
      : [];

    if (edits.length > 0 || commands.length > 0) {
      return {
        summary:
          typeof objectCandidate?.summary === "string"
            ? objectCandidate.summary
            : "Proposed agent changes",
        edits,
        commands,
      };
    }
  }

  const edits = extractStructuredEdits(response);

  return {
    summary: response.trim() || "No structured agent plan was returned.",
    edits,
    commands: [],
  };
}

function parseJsonCandidates(response: string): unknown[] {
  const candidates: string[] = [];
  const trimmed = response.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    candidates.push(trimmed);
  }

  for (const match of response.matchAll(jsonBlockPattern)) {
    candidates.push(match[1].trim());
  }

  return candidates.flatMap((candidate) => {
    try {
      return [JSON.parse(candidate)];
    } catch {
      return [];
    }
  });
}

function normalizeEdits(candidate: unknown): ProposedEdit[] {
  const value = asRecord(candidate);

  if (!value) {
    return [];
  }

  const rawEdits = Array.isArray(value.edits) ? value.edits : [value];
  const edits: ProposedEdit[] = [];

  for (const rawEdit of rawEdits) {
    const edit = asRecord(rawEdit);

    if (!edit) {
      continue;
    }

    const filePath = edit.filePath ?? edit.path;
    const replacement = edit.replacement ?? edit.content;

    if (typeof filePath === "string" && typeof replacement === "string") {
      edits.push({
        filePath,
        replacement,
        description:
          typeof edit.description === "string" ? edit.description : undefined,
        createIfMissing: edit.createIfMissing === true,
      });
    }
  }

  return edits;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}
