import OpenAI from "openai";
import * as vscode from "vscode";

import {
  getApiKey,
  getDefaultModel,
  getAdvancedModel,
  getMaxOutputTokens,
} from "./config";
import { ApiUsage } from "./types";

export async function getOpenAIClient(
  context: vscode.ExtensionContext
): Promise<OpenAI> {
  const apiKey = await getApiKey(context);

  return new OpenAI({
    apiKey,
  });
}

export type AssistantTaskType =
  | "simple"
  | "explain"
  | "tests"
  | "debug"
  | "refactor"
  | "agent";

function selectModel(taskType: AssistantTaskType): string {
  if (
    taskType === "debug" ||
    taskType === "refactor" ||
    taskType === "agent"
  ) {
    return getAdvancedModel();
  }

  return getDefaultModel();
}

export interface AskOpenAIOptions {
  signal?: AbortSignal;
  onUsage?: (usage: ApiUsage) => void;
}

export async function askOpenAI(
  context: vscode.ExtensionContext,
  prompt: string,
  systemPrompt?: string,
  onChunk?: (chunk: string) => void,
  taskType: AssistantTaskType = "simple",
  options: AskOpenAIOptions = {}
): Promise<string> {
  try {
    const client = await getOpenAIClient(context);
    const model = selectModel(taskType);

    const stream = await client.responses.stream({
      model,
      max_output_tokens: getMaxOutputTokens(),
      input: [
        ...(systemPrompt
          ? [
              {
                role: "system" as const,
                content: systemPrompt,
              },
            ]
          : []),
        {
          role: "user" as const,
          content: prompt,
        },
      ],
    }, {
      signal: options.signal,
    });

    let fullResponse = "";

    for await (const event of stream) {
      if (
        event.type ===
        "response.output_text.delta"
      ) {
        const delta = event.delta || "";

        fullResponse += delta;

        if (onChunk) {
          onChunk(delta);
        }
      }

      if (event.type === "response.completed" && event.response.usage) {
        options.onUsage?.(buildUsage(model, event.response.usage));
      }
    }

    return fullResponse;
  } catch (error) {
    console.error("OpenAI API Error:", error);

    const formattedError = formatOpenAIError(error);

    if (isAbortError(error)) {
      throw error;
    }

    vscode.window.showErrorMessage(formattedError);

    throw new Error(formattedError);
  }
}

function buildUsage(
  model: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  }
): ApiUsage {
  const pricing = getPricing(model);

  return {
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
    estimatedCostUsd:
      (usage.input_tokens / 1_000_000) * pricing.inputPerMillion +
      (usage.output_tokens / 1_000_000) * pricing.outputPerMillion,
  };
}

function getPricing(model: string): {
  inputPerMillion: number;
  outputPerMillion: number;
} {
  if (model.includes("gpt-4.1-mini")) {
    return {
      inputPerMillion: 0.4,
      outputPerMillion: 1.6,
    };
  }

  if (model.includes("gpt-4.1")) {
    return {
      inputPerMillion: 2,
      outputPerMillion: 8,
    };
  }

  return {
    inputPerMillion: 0,
    outputPerMillion: 0,
  };
}

function formatOpenAIError(error: unknown): string {
  if (isAbortError(error)) {
    return "Assistant generation stopped.";
  }

  const status = getErrorStatus(error);
  const message = error instanceof Error ? error.message : String(error);

  if (status === 429 || /rate limit|quota|too many requests/i.test(message)) {
    return "OpenAI rate limit reached. Wait a moment, reduce context size, or check your API usage limits.";
  }

  if (status === 401 || /api key|unauthorized/i.test(message)) {
    return "OpenAI API key was rejected. Reset your key and try again.";
  }

  if (status === 400 && /context|token/i.test(message)) {
    return "The request is too large for the model. Try selecting less code or lowering context limits.";
  }

  return `Failed to communicate with OpenAI API. ${message}`;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /aborted|abort/i.test(error.message))
  );
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate = error as { status?: unknown };

  return typeof candidate.status === "number" ? candidate.status : undefined;
}
