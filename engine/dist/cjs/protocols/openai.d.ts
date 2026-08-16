import { ProtocolAdapter } from './types.js';
/**
 * openai 协议（chat/completions）。与 anthropic / responses 并列的三协议实现之一。
 * 响应提取遵循「容错透传」：非 JSON / 缺 content 时返回原始响应文本。
 */
export declare const openaiAdapter: ProtocolAdapter;
