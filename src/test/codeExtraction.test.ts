import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractBestCode,
  extractStructuredEdits,
  parseAgentPlan,
} from "../services/codeExtraction";

describe("code extraction", () => {
  it("returns plain text when no code block is present", () => {
    assert.equal(extractBestCode("hello world"), "hello world");
  });

  it("extracts a single fenced code block", () => {
    const response = "Here you go:\n```ts\nconst value = 1;\n```";

    assert.equal(extractBestCode(response), "const value = 1;");
  });

  it("joins multiple fenced code blocks", () => {
    const response = "```ts\nconst a = 1;\n```\n```ts\nconst b = 2;\n```";

    assert.equal(extractBestCode(response), "const a = 1;\n\nconst b = 2;");
  });

  it("extracts structured edits from JSON", () => {
    const edits = extractStructuredEdits(
      JSON.stringify({
        edits: [
          {
            filePath: "src/example.ts",
            replacement: "export const ok = true;\n",
          },
        ],
      })
    );

    assert.deepEqual(edits, [
      {
        filePath: "src/example.ts",
        replacement: "export const ok = true;\n",
        description: undefined,
        createIfMissing: false,
      },
    ]);
  });

  it("parses an agent plan with edits and commands", () => {
    const plan = parseAgentPlan(`\`\`\`json
{
  "summary": "Update file",
  "edits": [
    {
      "filePath": "src/example.ts",
      "replacement": "export const ok = true;"
    }
  ],
  "commands": [
    {
      "command": "npm test",
      "reason": "Run tests"
    }
  ]
}
\`\`\``);

    assert.equal(plan.summary, "Update file");
    assert.equal(plan.edits.length, 1);
    assert.equal(plan.commands[0].command, "npm test");
  });
});
