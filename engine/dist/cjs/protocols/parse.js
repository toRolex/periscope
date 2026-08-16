"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tryParseJson = tryParseJson;
/**
 * 容错 JSON 解析：非 JSON 文本返回 null，由调用方按「透传原始文本」语义处理。
 * 三协议 extractText 共用的解析序段。
 */
function tryParseJson(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
