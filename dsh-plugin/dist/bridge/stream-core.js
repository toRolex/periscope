"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DESCRIBE_TIMEOUT_MS = exports.ENDPOINT_NOT_CONFIGURED_GUIDANCE = void 0;
exports.visionEndpointReady = visionEndpointReady;
exports.toPeriscopeConfig = toPeriscopeConfig;
exports.buildDescribeImage = buildDescribeImage;
exports.translateMessages = translateMessages;
exports.makeImageDescribedSink = makeImageDescribedSink;
exports.emitImageDescribed = emitImageDescribed;
const translate_1 = require("../core/translate");
/**
 * stream() 接线的纯逻辑核心（issue #29，ADR 0003 决策 1/5）：把「视觉配置 → describeImage」
 * 与「整段消息历史的 ImageBlock 翻译 + image/described 记录聚合」收敛为可离线单测的纯函数。
 *
 * 零 dsh 运行时耦合：dsh 的 stream()/attachment/session 边界全部挡在壳层（adapter.ts/plugin.ts），
 * 本模块只接受注入的函数面（describeEngine / readImage / sink），与 route.ts / vision-config.ts 同策略。
 *
 * 复用 #28 的 translateContent seam（单条 content 数组的翻译 + content-addressed 缓存），
 * 本模块把它抬升到「消息历史」粒度，并补上 #29 新增的：未配置引导占位符、超时降级、image/described 落点。
 */
// ── 视觉端点就绪判定与引导占位符 ─────────────────────────────────────────────
/** 视觉端点就绪判定：baseUrl 与 model 均非空白（空白串视为未配置）。 */
function visionEndpointReady(vision) {
    return vision.baseUrl.trim() !== '' && vision.model.trim() !== '';
}
/**
 * 端点未配置时的可操作引导占位符（指出 cordis.yml / env 两个配置位置）。
 * 与「描述不可用」（下游故障/超时）刻意区分：未配置是可操作的用户引导，不是运行时故障。
 */
exports.ENDPOINT_NOT_CONFIGURED_GUIDANCE = '视觉端点未配置：请在 dsh profile 的 cordis.yml 为 periscope-deepseek 插件配置 protocol/baseUrl/model' +
    '（或 export PERISCOPE_VISION_PROTOCOL / PERISCOPE_VISION_BASE_URL / PERISCOPE_VISION_MODEL）；' +
    'apiKey 仅从环境变量读取（默认 PERISCOPE_API_KEY，或 apiKeyEnv 指定的变量）。配置后重发即可看图';
/** ResolvedVisionConfig → describe 引擎的 PeriscopeConfig：端点放进激活协议段，其余协议段留空。 */
function toPeriscopeConfig(vision) {
    const endpoint = { baseUrl: vision.baseUrl, model: vision.model };
    const blank = { baseUrl: '', model: '' };
    return {
        protocol: vision.protocol,
        apiKey: vision.apiKey,
        openai: vision.protocol === 'openai' ? endpoint : blank,
        anthropic: vision.protocol === 'anthropic' ? endpoint : blank,
        responses: vision.protocol === 'responses' ? endpoint : blank,
    };
}
/** 默认视觉描述超时（ms）：超时按故障降级为占位符，绝不悬挂会话。本地/自建端点可能较慢，取偏宽松值。 */
exports.DESCRIBE_TIMEOUT_MS = 60_000;
/**
 * 由视觉配置构造 translateContent 的 describeImage：
 * - 未配置 → 返回引导占位符，绝不请求下游；
 * - 已配置 → 调 describe 引擎；超时（默认 60s）按故障 reject，由 translateContent 统一降级为
 *   `[Image N] 描述不可用` 占位符——会话绝不因下游悬挂/故障而中断。
 */
function buildDescribeImage(vision, describeFn, options = {}) {
    if (!visionEndpointReady(vision)) {
        return async () => exports.ENDPOINT_NOT_CONFIGURED_GUIDANCE;
    }
    const config = toPeriscopeConfig(vision);
    const timeoutMs = options.timeoutMs ?? exports.DESCRIBE_TIMEOUT_MS;
    return (bytes, intent) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`视觉端点超时（>${timeoutMs}ms）`)), timeoutMs);
        describeFn({ bytes, intent }, { config }).then((text) => {
            clearTimeout(timer);
            resolve(text);
        }, (error) => {
            clearTimeout(timer);
            reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
}
/**
 * 翻译整段消息历史里的 ImageBlock：逐消息走 translateContent（共享 cache），
 * 单图 / 多图 / 图文混合 / 嵌套 tool-result 图统一处理。绝不抛错（失败降级占位符，见 translateContent）。
 * 缓存命中（同图再发 / 历史重放）不重复请求下游，但仍产出记录供落 log。
 */
async function translateMessages(messages, deps) {
    const records = [];
    let anyImage = false;
    const out = [];
    for (const message of messages) {
        // translateContent 不改写入参 content，故 readonly → mutable 的窄化转换是安全的。
        const result = await (0, translate_1.translateContent)(message.content, deps);
        if (result.records.length === 0) {
            out.push(message);
        }
        else {
            anyImage = true;
            records.push(...result.records);
            out.push({ ...message, content: result.content });
        }
    }
    return { messages: anyImage ? out : messages, records };
}
/**
 * 构造 image/described 落点：先写一份诊断日志（重启可存查），再 best-effort append 到 session log。
 * 绝不抛错：session append 失败仅告警，不中断会话。
 *
 * ⚠️ 持久化限制（issue #24 源码核实，见 docs/adr/0003 与 #24 comment）：dsh 的 Session.append 无法标
 * ignorable，而 image/described 不在仓内生成的 KNOWN_SESSION_EVENT_TYPES，故含该事件的会话在
 * 「进程重启后重载」会被持久化层整体拒载。进程内的分叉/压缩读 live log 不受影响；重启恢复需 dsh 提供
 * out-of-repo 事件注册面或 append 支持 ignorable 后方可。诊断日志（logInfo）是本缺口下的重启可存查副本。
 */
function makeImageDescribedSink(deps) {
    return {
        describe(sessionId, record) {
            deps.logInfo(`[periscope] image/described ${record.attachmentId}: ${record.description}`);
            if (sessionId === undefined)
                return;
            try {
                deps.appendToSession(sessionId, record);
            }
            catch (error) {
                deps.logWarn('[periscope] image/described 落 session log 失败（不中断会话）', error);
            }
        },
    };
}
/** 把若干 image/described 记录逐条交给 sink（缓存命中的记录同样落 log）。 */
function emitImageDescribed(sink, sessionId, records) {
    for (const record of records)
        sink.describe(sessionId, record);
}
