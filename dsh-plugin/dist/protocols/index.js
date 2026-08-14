"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProtocol = getProtocol;
const openai_1 = require("./openai");
const anthropic_1 = require("./anthropic");
const responses_1 = require("./responses");
const ADAPTERS = {
    openai: openai_1.openaiAdapter,
    anthropic: anthropic_1.anthropicAdapter,
    responses: responses_1.responsesAdapter,
};
/** 按协议名取适配器；未知协议抛错。 */
function getProtocol(name) {
    const adapter = ADAPTERS[name];
    if (!adapter) {
        throw new Error(`未知协议: ${name}（可用: ${Object.keys(ADAPTERS).join(', ')}）`);
    }
    return adapter;
}
