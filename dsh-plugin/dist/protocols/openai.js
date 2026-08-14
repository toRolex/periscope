"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openaiAdapter = void 0;
const types_1 = require("./types");
const parse_1 = require("./parse");
/**
 * openai 协议（chat/completions）。与 anthropic / responses 并列的三协议实现之一。
 * 响应提取遵循「容错透传」：非 JSON / 缺 content 时返回原始响应文本。
 *
 * 本文件与主仓 src/protocols/openai.ts 逐字一致（纯拷贝，ADR 0003 决策 6）。
 */
exports.openaiAdapter = {
    name: 'openai',
    buildRequest(input) {
        const headers = { 'content-type': 'application/json' };
        if (input.apiKey) {
            headers.authorization = `Bearer ${input.apiKey}`;
        }
        return {
            url: `${input.baseUrl}/chat/completions`,
            headers,
            body: {
                model: input.model,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: input.intent ?? types_1.DEFAULT_IMAGE_PROMPT },
                            { type: 'image_url', image_url: { url: input.imageDataUrl } },
                        ],
                    },
                ],
            },
        };
    },
    extractText(responseText) {
        const data = (0, parse_1.tryParseJson)(responseText);
        if (data === null)
            return responseText; // 非 JSON → 透传原始文本
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content === 'string')
            return content;
        if (Array.isArray(content)) {
            const parts = content
                .filter((part) => part && typeof part === 'object' && typeof part.text === 'string')
                .map((part) => part.text);
            if (parts.length > 0)
                return parts.join('');
        }
        return responseText; // 缺 content / 形状异常 → 透传原始文本
    },
};
