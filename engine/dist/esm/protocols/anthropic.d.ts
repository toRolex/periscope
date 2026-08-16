import { ProtocolAdapter } from './types.js';
export declare const ANTHROPIC_VERSION = "2023-06-01";
/** 解析 data URL（data:image/<mime>;base64,<data>）为 anthropic image source 需要的 media_type 与 base64 data。 */
export declare function dataUrlToImageSource(dataUrl: string): {
    mediaType: string;
    data: string;
};
/**
 * anthropic 协议（v1/messages）。本期新增实现。
 * 鉴权头为 x-api-key + anthropic-version；图片走 image content block 的 source：
 * 本地 data URL 用 {base64,media_type,data}，http(s) URL 远程图用 {url}。
 * 响应提取遵循「容错透传」：非 JSON / 缺 content 时返回原始响应文本。
 */
export declare const anthropicAdapter: ProtocolAdapter;
