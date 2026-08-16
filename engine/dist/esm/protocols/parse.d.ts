/**
 * 容错 JSON 解析：非 JSON 文本返回 null，由调用方按「透传原始文本」语义处理。
 * 三协议 extractText 共用的解析序段。
 */
export declare function tryParseJson(text: string): unknown | null;
