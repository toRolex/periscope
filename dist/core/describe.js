"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.describe = describe;
exports.describeMany = describeMany;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const cache_1 = require("../cache");
const config_1 = require("../config/config");
const protocols_1 = require("../protocols");
const transport_1 = require("../transport");
/** 远程图片 URL（http/https）判定；此类图片不落本地缓存、请求体直接透传 URL。 */
const REMOTE_URL_RE = /^https?:\/\//i;
/**
 * 把图片源转为请求用的 image_url：本地路径读取文件转 data URL；
 * http(s) URL 直接透传（视觉模型自行获取，无需先下载到本地）。
 */
function sourceToImageUrl(source) {
    if (REMOTE_URL_RE.test(source)) {
        return source;
    }
    const resolved = path.resolve(source);
    let data;
    try {
        data = fs.readFileSync(resolved);
    }
    catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`无法读取图片文件: ${resolved}（${reason}）`);
    }
    const ext = path.extname(resolved).toLowerCase().replace('.', '') || 'png';
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    const base64 = data.toString('base64');
    return `data:image/${mime};base64,${base64}`;
}
function endpointFor(config) {
    const endpoint = config[config.protocol];
    if (!endpoint || typeof endpoint !== 'object') {
        throw new Error(`配置缺少协议 ${config.protocol} 的 baseUrl/model`);
    }
    return { baseUrl: String(endpoint.baseUrl), model: String(endpoint.model) };
}
function truncate(text, max = 200) {
    const single = text.replace(/\s+/g, ' ').trim();
    return single.length > max ? `${single.slice(0, max)}…` : single;
}
/**
 * 协议无关核心：单图视觉描述。
 * 流程：加载配置（懒创建 + 环境变量优先）→ 按协议取适配器 → 本地图片查缓存（key =
 * 图片路径+修改时间+大小+意图 哈希；远程 URL 不缓存）→ 未命中才转 data URL → 适配器构造请求
 * → 传输发出 → 非 2xx 抛错、2xx 容错提取文本 → 结果写回缓存。
 */
async function describe(input, opts = {}) {
    const config = opts.config ?? (0, config_1.loadConfig)({ configPath: opts.configPath });
    const adapter = (0, protocols_1.getProtocol)(config.protocol);
    const transport = opts.transport ?? transport_1.defaultTransport;
    const cacheDir = opts.cacheDir === undefined ? (0, cache_1.defaultCacheDir)() : opts.cacheDir;
    let cache = null;
    // 远程 URL 不落本地缓存：缓存 key 依赖本地文件 stat，且远程内容可变。
    if (cacheDir !== null && !REMOTE_URL_RE.test(input.imagePath)) {
        const key = (0, cache_1.imageCacheKey)(input.imagePath, input.intent);
        cache = { dir: cacheDir, key };
        const cached = (0, cache_1.readCacheEntry)(key, cacheDir);
        if (cached !== undefined)
            return cached;
    }
    const imageUrl = sourceToImageUrl(input.imagePath);
    const { baseUrl, model } = endpointFor(config);
    const request = adapter.buildRequest({
        baseUrl,
        model,
        imageDataUrl: imageUrl,
        intent: input.intent,
        apiKey: config.apiKey || undefined,
    });
    const response = await transport.post(request);
    if (!response.ok) {
        throw new Error(`视觉端点返回 HTTP ${response.status}: ${truncate(response.text)}`);
    }
    const text = adapter.extractText(response.text);
    if (cache !== null)
        (0, cache_1.writeCacheEntry)(cache.key, text, cache.dir);
    return text;
}
/**
 * 多图并行视觉描述：逐图容错聚合，按输入顺序返回结果。
 * 单图失败不丢弃其余成功结果——失败项 description 为 null 并附 error，调用方自行决定如何呈现。
 */
async function describeMany(inputs, opts = {}) {
    const settled = await Promise.allSettled(inputs.map((input) => describe(input, opts)));
    return settled.map((result, i) => ({
        source: inputs[i].imagePath,
        description: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected'
            ? result.reason instanceof Error
                ? result.reason.message
                : String(result.reason)
            : undefined,
    }));
}
