"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProtocol = getProtocol;
const openai_js_1 = require("./openai.js");
const anthropic_js_1 = require("./anthropic.js");
const responses_js_1 = require("./responses.js");
const ADAPTERS = {
    openai: openai_js_1.openaiAdapter,
    anthropic: anthropic_js_1.anthropicAdapter,
    responses: responses_js_1.responsesAdapter,
};
/** 按协议名取适配器；未知协议抛错。 */
function getProtocol(name) {
    const adapter = ADAPTERS[name];
    if (!adapter) {
        throw new Error(`未知协议: ${name}（可用: ${Object.keys(ADAPTERS).join(', ')}）`);
    }
    return adapter;
}
