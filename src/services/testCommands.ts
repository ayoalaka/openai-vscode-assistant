import * as path from "path";
import * as vscode from "vscode";

import { ProposedCommand } from "../types";

export async function detectTestCommands(): Promise<ProposedCommand[]> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const commands: ProposedCommand[] = [];

  for (const folder of folders) {
    const packageJsonUri = vscode.Uri.joinPath(folder.uri, "package.json");

    try {
      const bytes = await vscode.workspace.fs.readFile(packageJsonUri);
      const packageJson = JSON.parse(Buffer.from(bytes).toString("utf8")) as {
        scripts?: Record<string, string>;
      };

      if (packageJson.scripts?.test) {
        commands.push({
          command: "npm test",
          cwd: folder.uri.fsPath,
          reason: "Detected package.json test script",
        });
      }

      for (const scriptName of Object.keys(packageJson.scripts ?? {})) {
        if (/^(test|check|lint)(:|$)/.test(scriptName) && scriptName !== "test") {
          commands.push({
            command: `npm run ${scriptName}`,
            cwd: folder.uri.fsPath,
            reason: `Detected package.json script: ${scriptName}`,
          });
        }
      }
    } catch {
      const folderName = path.basename(folder.uri.fsPath);
      commands.push({
        command: "npm test",
        cwd: folder.uri.fsPath,
        reason: `No package.json test script detected for ${folderName}; npm test is a common default`,
      });
    }
  }

  return commands;
}
