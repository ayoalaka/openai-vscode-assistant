import * as vscode from "vscode";

import { getEnableTerminalExecution } from "../config";
import { ProposedCommand } from "../types";

export class TerminalRunner {
  private pendingCommands: ProposedCommand[] = [];

  setPendingCommands(commands: ProposedCommand[]): void {
    this.pendingCommands = commands;
  }

  async runCommand(index = 0): Promise<void> {
    if (!getEnableTerminalExecution()) {
      vscode.window.showWarningMessage("Terminal execution is disabled.");
      return;
    }

    const command = this.pendingCommands[index];

    if (!command) {
      vscode.window.showInformationMessage("No approved command is pending.");
      return;
    }

    const approved = await vscode.window.showWarningMessage(
      `Run command: ${command.command}`,
      { modal: true },
      "Run"
    );

    if (approved !== "Run") {
      return;
    }

    const terminal = vscode.window.createTerminal({
      name: "OpenAI Assistant",
      cwd: command.cwd,
    });

    terminal.show();
    terminal.sendText(command.command);
  }
}
