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
exports.getApiKey = getApiKey;
exports.getModel = getModel;
exports.getMaxOutputTokens = getMaxOutputTokens;
exports.resetApiKey = resetApiKey;
const vscode = __importStar(require("vscode"));
const API_KEY_SECRET = "openaiAssistant.apiKey";
async function getApiKey(context) {
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
function getModel() {
    return vscode.workspace
        .getConfiguration("openaiAssistant")
        .get("model", "gpt-4.1-mini");
}
function getMaxOutputTokens() {
    return vscode.workspace
        .getConfiguration("openaiAssistant")
        .get("maxOutputTokens", 1200);
}
async function resetApiKey(context) {
    await context.secrets.delete(API_KEY_SECRET);
    vscode.window.showInformationMessage("OpenAI API key reset.");
}
//# sourceMappingURL=config.js.map