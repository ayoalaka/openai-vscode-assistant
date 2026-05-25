# OpenAI VS Code Assistant

A custom VS Code coding assistant powered by the OpenAI API.

This extension provides an AI-powered sidebar chat experience for debugging, explaining code, generating tests, and assisting with software development directly inside VS Code.

---

## Features

### AI Sidebar Chat

A dedicated Activity Bar icon opens a persistent AI chat panel inside VS Code.

Features include:

- Streaming responses
- Conversation memory
- Context-aware code assistance
- Code selection awareness
- Insert generated responses into editor
- Replace selected code with generated fixes

---

### Quick Actions

Built-in quick actions for common workflows:

- **Explain Code**
- **Fix Bugs**
- **Generate Tests**

The assistant automatically uses selected code when available.

---

### Context Awareness

The assistant can understand:

- Current selected code
- Current file
- File language
- Editor context

Supported examples:

```text
Explain this code
Fix this function
Generate tests
Refactor this method
Find bugs in this class
````

---

## Architecture

```text
openai-vscode-assistant/
├── media/
│   └── icon.svg
│
├── src/
│   ├── commands/
│   │   ├── askAssistant.ts
│   │   ├── explainCode.ts
│   │   ├── fixCode.ts
│   │   └── generateTests.ts
│   │
│   ├── panels/
│   │   └── ChatPanel.ts
│   │
│   ├── views/
│   │   └── ChatViewProvider.ts
│   │
│   ├── utils/
│   │   ├── editor.ts
│   │   └── output.ts
│   │
│   ├── config.ts
│   ├── extension.ts
│   ├── openaiClient.ts
│   └── prompts.ts
│
├── package.json
├── tsconfig.json
└── README.md
```

---

## Installation

### Install From VSIX

1. Open VS Code
2. Go to:

```text
Extensions → ... → Install from VSIX
```

3. Select:

```text
openai-vscode-assistant-x.x.x.vsix
```

4. Restart VS Code

---

## Development Setup

Clone project:

```bash
git clone https://github.com/your-repo/openai-vscode-assistant.git
cd openai-vscode-assistant
```

Install dependencies:

```bash
npm install
```

Compile:

```bash
npm run compile
```

Run Extension Development Host:

```text
Press F5
```

---

## Packaging Extension

Build VSIX package:

```bash
npx vsce package --allow-missing-repository
```

Install locally:

```bash
code --install-extension openai-vscode-assistant-0.0.1.vsix
```

---

## OpenAI API Setup

On first use, the extension prompts for an OpenAI API key.

The key is securely stored using:

```text
VS Code SecretStorage
```

You can reset your API key via:

```text
OpenAI Assistant: Reset API Key
```

---

## Configuration

Settings available:

### Default Model

Low-cost model for general coding tasks.

```json
"openaiAssistant.defaultModel": "gpt-4.1-mini"
```

### Advanced Model

Used for debugging, refactoring, and harder reasoning.

```json
"openaiAssistant.advancedModel": "gpt-4.1"
```

### Max Output Tokens

```json
"openaiAssistant.maxOutputTokens": 1200
```

---

## Model Routing

The extension intelligently routes tasks to models.

### Lightweight Tasks

Uses:

```text
gpt-4.1-mini
```

Examples:

* Explain code
* Generate tests
* General questions

### Advanced Tasks

Uses:

```text
gpt-4.1
```

Examples:

* Debugging
* Refactoring
* Complex architecture analysis

---

## Commands

Available commands:

| Command                                   | Description              |
| ----------------------------------------- | ------------------------ |
| `OpenAI Assistant: Ask`                   | Ask a coding question    |
| `OpenAI Assistant: Explain Selected Code` | Explain highlighted code |
| `OpenAI Assistant: Fix Selected Code`     | Debug selected code      |
| `OpenAI Assistant: Generate Tests`        | Generate tests           |
| `OpenAI Assistant: Open Chat`             | Open standalone chat     |
| `OpenAI Assistant: Reset API Key`         | Reset saved API key      |

---

## Roadmap

Planned features:

* Smart code extraction for Insert/Replace
* Workspace-aware context
* Related file discovery
* Agent mode
* Inline diffs
* Accept/Reject edits
* Repo indexing
* Multi-file reasoning
* Terminal integration
* Test runner integration

---

## License

See LICENSE.md

Happy Coding! :)