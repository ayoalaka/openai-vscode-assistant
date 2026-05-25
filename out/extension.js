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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const ChatPanel_1 = require("./panels/ChatPanel");
const askAssistant_1 = require("./commands/askAssistant");
const explainCode_1 = require("./commands/explainCode");
const fixCode_1 = require("./commands/fixCode");
const generateTests_1 = require("./commands/generateTests");
const config_1 = require("./config");
function activate(context) {
    console.log("OpenAI VS Code Assistant activated.");
    const commands = [
        vscode.commands.registerCommand("openaiAssistant.ask", async () => {
            await (0, askAssistant_1.askAssistant)(context);
        }),
        vscode.commands.registerCommand("openaiAssistant.explainCode", async () => {
            await (0, explainCode_1.explainCode)(context);
        }),
        vscode.commands.registerCommand("openaiAssistant.fixCode", async () => {
            await (0, fixCode_1.fixCode)(context);
        }),
        vscode.commands.registerCommand("openaiAssistant.generateTests", async () => {
            await (0, generateTests_1.generateTests)(context);
        }),
        vscode.commands.registerCommand("openaiAssistant.resetApiKey", async () => {
            await (0, config_1.resetApiKey)(context);
        }),
        vscode.commands.registerCommand("openaiAssistant.openChat", () => {
            ChatPanel_1.ChatPanel.createOrShow(context);
        }),
    ];
    context.subscriptions.push(...commands);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map