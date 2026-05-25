import OpenAI from "openai";
import * as vscode from "vscode";

import {
  getApiKey,
  getModel,
  getMaxOutputTokens,
} from "./config";

export async function getOpenAIClient(
  context: vscode.ExtensionContext
): Promise<OpenAI> {
  const apiKey = await getApiKey(context);

  return new OpenAI({
    apiKey,
  });
}

export async function askOpenAI(
  context: vscode.ExtensionContext,
  prompt: string,
  systemPrompt?: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  try {
    const client = await getOpenAIClient(context);

    const stream = await client.responses.stream({
      model: getModel(),
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
    }

    return fullResponse;
  } catch (error) {
    console.error("OpenAI API Error:", error);

    vscode.window.showErrorMessage(
      "Failed to communicate with OpenAI API."
    );

    throw error;
  }
}