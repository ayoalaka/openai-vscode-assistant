import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel;

export function getOutputChannel() {
  if (!outputChannel) {
    outputChannel =
      vscode.window.createOutputChannel(
        "OpenAI Assistant"
      );
  }

  return outputChannel;
}

export function clearOutput() {
  getOutputChannel().clear();
}

export function appendOutput(text: string) {
  const channel = getOutputChannel();

  channel.append(text);
  channel.show(true);
}

export function showAssistantResponse(
  title: string,
  response: string
) {
  const channel = getOutputChannel();

  channel.clear();

  channel.appendLine(`## ${title}`);
  channel.appendLine("");
  channel.append(response);

  channel.show(true);
}

export function showError(
  message: string,
  error: unknown
) {
  const channel = getOutputChannel();

  channel.appendLine("## Error");
  channel.appendLine(message);

  if (error instanceof Error) {
    channel.appendLine(error.message);
  }

  channel.show(true);
}