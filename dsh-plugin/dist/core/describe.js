import { endpointMissingError, loadConfig } from '../config/config.js';
import { getProtocol, defaultTransport, resolveIntent } from 'periscope-engine';
function endpointFor(config) {
    const error = endpointMissingError(config.protocol, config[config.protocol]);
    if (error !== null)
        throw new Error(error);
    const endpoint = config[config.protocol];
    return { baseUrl: String(endpoint.baseUrl), model: String(endpoint.model) };
}
function truncate(text, max = 200) {
    const single = text.replace(/\s+/g, ' ').trim();
    return single.length > max ? `${single.slice(0, max)}…` : single;
}
/** 图片字节 → 请求用 data URL（data:<mime>;base64,<...>）。 */
function bytesToImageDataUrl(bytes, mimeType = 'image/png') {
    return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}
/**
 * 协议无关核心：单图视觉描述（图片字节输入）。
 * 流程：加载配置（懒创建 + 环境变量优先）→ 按协议取适配器 → 校验端点（空白模板尽早给出可操作报错）
 * → 任务模板解析 intent（命中 ocr/table/chart 替换为模板 prompt）→ 字节转 data URL → 适配器构造请求
 * → 传输发出 → 非 2xx 抛错、2xx 容错提取文本。
 * 本副本不含任何缓存：content-addressed 缓存归桥接核心票 #28。
 */
export async function describe(input, opts = {}) {
    const config = opts.config ?? loadConfig({ configPath: opts.configPath });
    const adapter = getProtocol(config.protocol);
    const transport = opts.transport ?? defaultTransport;
    // 先校验端点：空白模板（未配置 baseUrl/model）应尽早给出可操作报错，而不是等到构造请求之后。
    const { baseUrl, model } = endpointFor(config);
    // 任务模板解析：命中模板名（ocr/table/chart）替换为模板 prompt，自定义文本原样透传，缺省保持默认描述。
    const intent = resolveIntent(input.intent);
    const imageDataUrl = bytesToImageDataUrl(input.bytes, input.mimeType);
    const request = adapter.buildRequest({
        baseUrl,
        model,
        imageDataUrl,
        intent,
        apiKey: config.apiKey || undefined,
    });
    const response = await transport.post(request);
    if (!response.ok) {
        throw new Error(`视觉端点返回 HTTP ${response.status}: ${truncate(response.text)}`);
    }
    return adapter.extractText(response.text);
}
/**
 * 多图并行视觉描述：逐图容错聚合，按输入顺序返回结果。
 * 单图失败不丢弃其余成功结果——失败项 description 为 null 并附 error，调用方自行决定如何呈现。
 */
export async function describeMany(inputs, opts = {}) {
    const settled = await Promise.allSettled(inputs.map((input) => describe(input, opts)));
    return settled.map((result, i) => ({
        source: inputs[i].source ?? `图片 ${i + 1}`,
        description: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected'
            ? result.reason instanceof Error
                ? result.reason.message
                : String(result.reason)
            : undefined,
    }));
}
