import { ProtocolAdapter } from './types.js';
/**
 * openai responses 协议（v1/responses）。本期新增实现。
 * 图片走 input[].content[] 的 input_image 块（image_url 直接携带 data URL）。
 * 响应提取遵循「容错透传」：非 JSON / 缺 output 时返回原始响应文本。
 */
export declare const responsesAdapter: ProtocolAdapter;
