"use strict";
/**
 * 桥接核心（ADR 0003 决策 1/5）：把模型可见 content 里的 ImageBlock 翻译成 `[Image N] 描述` 文字。
 * 唯一新 seam：`translateContent(content, deps)` 纯函数——dsh 的 stream()/attachment/session 边界全部挡在 seam 外，
 * 由壳注入 readImage（→ ctx.attachments.readImage）与 describeImage（→ describe 引擎）并负责落 log。
 * 本模块不 import dsh 真实类型：ImageBlock 归一化收敛到 normalizeImageBlock 一个函数，结构变更爆炸半径限于本文件。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeImageBlock = normalizeImageBlock;
exports.translateContent = translateContent;
/**
 * 窄 ImageBlock 归一化：识别 { type:'image', attachment:{ attachmentId: string } }，其余返回 null。
 * 这是唯一感知 dsh ImageBlock 结构的地方；dsh 类型变更时只改这里。
 */
function normalizeImageBlock(block) {
    if (typeof block !== 'object' || block === null)
        return null;
    const candidate = block;
    if (candidate.type !== 'image')
        return null;
    const attachment = candidate.attachment;
    if (typeof attachment !== 'object' || attachment === null)
        return null;
    const attachmentId = attachment.attachmentId;
    if (typeof attachmentId !== 'string' || attachmentId === '')
        return null;
    return { attachmentId, attachment };
}
/** 取出 block 的嵌套 content（如 tool-result 的 ContentBlock[]）；非容器返回 null。 */
function nestedContent(block) {
    if (typeof block !== 'object' || block === null)
        return null;
    const content = block.content;
    return Array.isArray(content) ? content : null;
}
/** 失败降级占位符的描述部分：翻译文字为 `[Image N] 描述不可用`，image/described 记录同值。 */
const DESCRIPTION_UNAVAILABLE = '描述不可用';
/** 模型可见 content → 翻译后 content + 待 append 的 image/described 记录。绝不抛错（失败降级占位符）。 */
async function translateContent(content, deps) {
    const records = [];
    const cache = deps.cache ?? new Map();
    let imageIndex = 0;
    /** 读字节 + 视觉描述；缓存命中直接用缓存描述；任何失败降级为占位符描述（绝不抛错，失败不写缓存）。 */
    async function describeOne(image) {
        const hit = cache.get(image.attachmentId);
        if (hit !== undefined)
            return hit;
        try {
            const description = await deps.describeImage(await deps.readImage(image.attachment), deps.intent);
            cache.set(image.attachmentId, description);
            return description;
        }
        catch {
            return DESCRIPTION_UNAVAILABLE;
        }
    }
    async function translateBlock(block) {
        const image = normalizeImageBlock(block);
        if (image !== null) {
            imageIndex += 1;
            const description = await describeOne(image);
            records.push({ attachmentId: image.attachmentId, description });
            const textBlock = {
                type: 'text',
                text: `[Image ${imageIndex}] ${description}`,
            };
            return textBlock;
        }
        const nested = nestedContent(block);
        if (nested !== null) {
            return { ...block, content: await translateBlocks(nested) };
        }
        return block;
    }
    async function translateBlocks(blocks) {
        const out = [];
        for (const block of blocks)
            out.push(await translateBlock(block));
        return out;
    }
    return { content: await translateBlocks(content), records };
}
