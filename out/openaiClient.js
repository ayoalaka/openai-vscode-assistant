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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOpenAIClient = getOpenAIClient;
exports.askOpenAI = askOpenAI;
const openai_1 = __importDefault(require("openai"));
const vscode = __importStar(require("vscode"));
const config_1 = require("./config");
async function getOpenAIClient(context) {
    const apiKey = await (0, config_1.getApiKey)(context);
    return new openai_1.default({
        apiKey,
    });
}
async function askOpenAI(context, prompt, systemPrompt, onChunk) {
    try {
        const client = await getOpenAIClient(context);
        const stream = await client.responses.stream({
            model: (0, config_1.getModel)(),
            max_output_tokens: (0, config_1.getMaxOutputTokens)(),
            input: [
                ...(systemPrompt
                    ? [
                        {
                            role: "system",
                            content: systemPrompt,
                        },
                    ]
                    : []),
                {
                    role: "user",
                    content: prompt,
                },
            ],
        });
        let fullResponse = "";
        for await (const event of stream) {
            if (event.type ===
                "response.output_text.delta") {
                const delta = event.delta || "";
                fullResponse += delta;
                if (onChunk) {
                    onChunk(delta);
                }
            }
        }
        return fullResponse;
    }
    catch (error) {
        console.error("OpenAI API Error:", error);
        vscode.window.showErrorMessage("Failed to communicate with OpenAI API.");
        throw error;
    }
}
//# sourceMappingURL=openaiClient.js.map