"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.explainCode = explainCode;
const vscode = __importStar(require("vscode"));
const openaiClient_1 = require("../openaiClient");
const prompts_1 = require("../prompts");
const editor_1 = require("../utils/editor");
const output_1 = require("../utils/output");
async function explainCode(context) {
    try {
        const editorContext = (0, editor_1.getEditorContext)();
        const prompt = (0, editor_1.buildCodeContextPrompt)("Explain this code clearly.", editorContext);
        (0, output_1.clearOutput)();
        (0, output_1.appendOutput)("## Code Explanation\n\n");
        await (0, openaiClient_1.askOpenAI)(context, prompt, prompts_1.SYSTEM_PROMPTS.explainCode, (chunk) => {
            (0, output_1.appendOutput)(chunk);
        });
    }
    catch (error) {
        vscode.window.showErrorMessage("Failed to explain code.");
        (0, output_1.showError)("Failed to explain code.", error);
    }
}
//# sourceMappingURL=explainCode.js.map