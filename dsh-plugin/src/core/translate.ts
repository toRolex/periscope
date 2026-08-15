/**
 * 桥接核心（ADR 0003 决策 1/5）：把模型可见 content 里的 ImageBlock 翻译成 `[Image N] 描述` 文字。
 * 唯一新 seam：`translateContent(content, deps)` 纯函数——dsh 的 stream()/attachment/session 边界全部挡在 seam 外，
 * 由壳注入 readImage（→ ctx.attachments.readImage）与 describeImage（→ describe 引擎）并负责落 log。
 * 本模块不 import dsh 真实类型：ImageBlock 归一化收敛到 normalizeImageBlock 一个函数，结构变更爆炸半径限于本文件。
 */

/** 归一化后的图片最小形态：桥接核心只依赖它（attachmentId 为缓存 key 与 image/described 记录键）。 */
export interface NormalizedImage {
  /** content-addressed attachmentId（如 sha256:<hex>）。 */
  attachmentId: string;
  /** 原始 attachment 引用，原样透传给 readImage（生产环境 dsh readImage 需完整 ref）。 */
  attachment: unknown;
}

/** 翻译后 content 中的文字 block（ImageBlock 被替换为该形态，与 dsh text block 同形）。 */
export interface TranslatedTextBlock {
  type: 'text';
  text: string;
}

/** 待壳 append 的 image/described 记录：attachmentId → 描述（失败降级时为占位符描述）。每张图一条。 */
export interface ImageDescribedRecord {
  attachmentId: string;
  description: string;
}

/** 注入依赖：测试注入 fake 全程离线；生产由壳接线。 */
export interface TranslateDeps {
  /** 按 attachment 引用读图片字节（生产 → ctx.attachments.readImage）。 */
  readImage(attachment: unknown): Promise<Uint8Array>;
  /** 图片字节 → 视觉描述（生产 → describe 引擎副本，输入为 Uint8Array）。 */
  describeImage(bytes: Uint8Array, intent?: string): Promise<string>;
  /** 可选 intent：透传给 describeImage（任务模板名或自定义文案），缺省走引擎默认描述。 */
  intent?: string;
  /**
   * 可选 content-addressed 缓存（attachmentId → 描述）。缺省每次调用新建（仅本次调用内去重）；
   * 注入共享 Map 可跨调用命中——命中不重复请求 describeImage，命中仍产出记录。
   */
  cache?: Map<string, string>;
}

export interface TranslateResult {
  /** 翻译后 content：ImageBlock 替换为 `[Image N] 描述` 文字 block，其余 block 原样透传。 */
  content: unknown[];
  /** 待壳 append 的 image/described 记录（每张图一条，含缓存命中与失败降级）。 */
  records: ImageDescribedRecord[];
}

/**
 * 窄 ImageBlock 归一化：识别 { type:'image', attachment:{ attachmentId: string } }，其余返回 null。
 * 这是唯一感知 dsh ImageBlock 结构的地方；dsh 类型变更时只改这里。
 */
export function normalizeImageBlock(block: unknown): NormalizedImage | null {
  if (typeof block !== 'object' || block === null) return null;
  const candidate = block as Record<string, unknown>;
  if (candidate.type !== 'image') return null;
  const attachment = candidate.attachment;
  if (typeof attachment !== 'object' || attachment === null) return null;
  const attachmentId = (attachment as Record<string, unknown>).attachmentId;
  if (typeof attachmentId !== 'string' || attachmentId === '') return null;
  return { attachmentId, attachment };
}

/** 取出 block 的嵌套 content（如 tool-result 的 ContentBlock[]）；非容器返回 null。 */
function nestedContent(block: unknown): unknown[] | null {
  if (typeof block !== 'object' || block === null) return null;
  const content = (block as Record<string, unknown>).content;
  return Array.isArray(content) ? content : null;
}

/** 失败降级占位符的描述部分：翻译文字为 `[Image N] 描述不可用`，image/described 记录同值。 */
const DESCRIPTION_UNAVAILABLE = '描述不可用';

/** 模型可见 content → 翻译后 content + 待 append 的 image/described 记录。绝不抛错（失败降级占位符）。 */
export async function translateContent(
  content: unknown[],
  deps: TranslateDeps,
): Promise<TranslateResult> {
  const records: ImageDescribedRecord[] = [];
  const cache = deps.cache ?? new Map<string, string>();
  let imageIndex = 0;

  /** 读字节 + 视觉描述；缓存命中直接用缓存描述；任何失败降级为占位符描述（绝不抛错，失败不写缓存）。 */
  async function describeOne(image: NormalizedImage): Promise<string> {
    const hit = cache.get(image.attachmentId);
    if (hit !== undefined) return hit;
    try {
      const description = await deps.describeImage(
        await deps.readImage(image.attachment),
        deps.intent,
      );
      cache.set(image.attachmentId, description);
      return description;
    } catch {
      return DESCRIPTION_UNAVAILABLE;
    }
  }

  async function translateBlock(block: unknown): Promise<unknown> {
    const image = normalizeImageBlock(block);
    if (image !== null) {
      imageIndex += 1;
      const description = await describeOne(image);
      records.push({ attachmentId: image.attachmentId, description });
      const textBlock: TranslatedTextBlock = {
        type: 'text',
        text: `[Image ${imageIndex}] ${description}`,
      };
      return textBlock;
    }
    const nested = nestedContent(block);
    if (nested !== null) {
      return { ...(block as Record<string, unknown>), content: await translateBlocks(nested) };
    }
    return block;
  }

  async function translateBlocks(blocks: unknown[]): Promise<unknown[]> {
    const out: unknown[] = [];
    for (const block of blocks) out.push(await translateBlock(block));
    return out;
  }

  return { content: await translateBlocks(content), records };
}
