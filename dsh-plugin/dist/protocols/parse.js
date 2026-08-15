/**
 * 容错 JSON 解析：非 JSON 文本返回 null，由调用方按「透传原始文本」语义处理。
 * 三协议 extractText 共用的解析序段。
 *
 * 本文件与主仓 src/protocols/parse.ts 逐字一致（纯拷贝，ADR 0003 决策 6）。
 */
export function tryParseJson(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
