"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.anthropicAdapter = exports.ANTHROPIC_VERSION = void 0;
exports.dataUrlToImageSource = dataUrlToImageSource;
const types_1 = require("./types");
const parse_1 = require("./parse");
exports.ANTHROPIC_VERSION = '2023-06-01';
/** 解析 data URL（data:image/<mime>;base64,<data>）为 anthropic image source 需要的 media_type 与 base64 data。 */
function dataUrlToImageSource(dataUrl) {
    const comma = dataUrl.indexOf(',');
    const meta = comma === -1 ? '' : dataUrl.slice(0, comma);
    const data = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
    const mediaType = meta
        .replace(/^data:/, '')
        .replace(/;base64$/i, '');
    return { mediaType, data };
}
/** http(s) URL 判定：远程图直接透传 URL，无需下载为 data URL。 */
const REMOTE_URL_RE = /^https?:\/\//i;
/**
 * 把图片源转为 anthropic image source：本地 data URL 用 {base64,media_type,data}；
 * http(s) URL 远程图用 {type:"url",url}，与其他协议对 URL 图的行为保持一致。
 */
function toImageSource(imageDataUrl) {
    if (REMOTE_URL_RE.test(imageDataUrl)) {
        return { type: 'url', url: imageDataUrl };
    }
    const { mediaType, data } = dataUrlToImageSource(imageDataUrl);
    return { type: 'base64', media_type: mediaType, data };
}
/**
 * anthropic 协议（v1/messages）。本期新增实现。
 * 鉴权头为 x-api-key + anthropic-version；图片走 image content block 的 source：
 * 本地 data URL 用 {base64,media_type,data}，http(s) URL 远程图用 {url}。
 * 响应提取遵循「容错透传」：非 JSON / 缺 content 时返回原始响应文本。
 */
exports.anthropicAdapter = {
    name: 'anthropic',
    buildRequest(input) {
        const headers = {
            'content-type': 'application/json',
            'anthropic-version': exports.ANTHROPIC_VERSION,
        };
        if (input.apiKey) {
            headers['x-api-key'] = input.apiKey;
        }
        const source = toImageSource(input.imageDataUrl);
        return {
            url: `${input.baseUrl}/v1/messages`,
            headers,
            body: {
                model: input.model,
                max_tokens: 1024,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: input.intent ?? types_1.DEFAULT_IMAGE_PROMPT },
                            { type: 'image', source },
                        ],
                    },
                ],
            },
        };
    },
    extractText(responseText) {
        const parsed = (0, parse_1.tryParseJson)(responseText);
        if (parsed === null)
            return responseText; // 非 JSON → 透传原始文本
        const content = parsed?.content;
        if (!Array.isArray(content))
            return responseText; // 缺 content → 透传原始文本
        const parts = content
            .filter((block) => block &&
            typeof block === 'object' &&
            block.type === 'text' &&
            typeof block.text === 'string')
            .map((block) => block.text);
        if (parts.length === 0)
            return responseText; // 无 text 块 → 透传原始文本
        return parts.join('');
    },
};
