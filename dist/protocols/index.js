"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProtocol = getProtocol;
const openai_1 = require("./openai");
const ADAPTERS = {
    openai: openai_1.openaiAdapter,
    // 扩展位：anthropic（v1/messages）、responses（v1/responses）在后续 issue 实现后注册于此。
};
/** 按协议名取适配器；未知协议抛错。 */
function getProtocol(name) {
    const adapter = ADAPTERS[name];
    if (!adapter) {
        throw new Error(`未知协议: ${name}（可用: ${Object.keys(ADAPTERS).join(', ')}）`);
    }
    return adapter;
}
