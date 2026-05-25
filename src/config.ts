import * as vscode from "vscode";

const API_KEY_SECRET = "openaiAssistant.apiKey";

export async function getApiKey(
  context: vscode.ExtensionContext
): Promise<string> {
  let apiKey = await context.secrets.get(API_KEY_SECRET);

  if (!apiKey) {
    apiKey = await vscode.window.showInputBox({
      prompt: "Enter your OpenAI API key",
      password: true,
      ignoreFocusOut: true,
    });

    if (!apiKey) {
      throw new Error("OpenAI API key is required.");
    }

    await context.secrets.store(API_KEY_SECRET, apiKey);
  }

  return apiKey;
}

export function getModel(): string {
  return vscode.workspace
    .getConfiguration("openaiAssistant")
    .get<string>("model", "gpt-4.1-mini");
}

export function getMaxOutputTokens(): number {
  return vscode.workspace
    .getConfiguration("openaiAssistant")
    .get<number>("maxOutputTokens", 1200);
}

export async function resetApiKey(
  context: vscode.ExtensionContext
): Promise<void> {
  await context.secrets.delete(API_KEY_SECRET);
  vscode.window.showInformationMessage("OpenAI API key reset.");
}