"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PeriscopeBridgeAdapter = void 0;
const dsh_llm_1 = require("@deepseek-ai/dsh-llm");
const describe_1 = require("../core/describe");
const stream_core_1 = require("./stream-core");
const route_1 = require("./route");
/**
 * periscope 的 dsh 桥接适配器：一个声明 image 输入能力的 LlmAdapter。
 *
 * 本票（#29）把桥接核心接进 stream()：读 ImageBlock → resolve 字节（readImage）→
 * BYOM 视觉描述（describeImage）→ translateMessages 翻译为 `[Image N] 描述` 文字 →
 * 委托 deepseek 主文本模型；翻译产出的 image/described 记录经 sink 落 session log + 诊断日志。
 * 下游故障/超时降级 `[Image N] 描述不可用` 占位符，端点未配置降级为可操作引导占位符，均落 log、不抛错。
 *
 * 本类是 dsh 集成壳（extends 真实 LlmAdapter），只在 dsh 宿主运行时加载，不进离线单测；
 * 可测的纯逻辑都在 route.ts / vision-config.ts / stream-core.ts。
 */
class PeriscopeBridgeAdapter extends dsh_llm_1.LlmAdapter {
    /** 解析好的视觉端点配置（cordis.yml + env fallback，apiKey 仅从 env）。 */
    vision;
    delegate;
    readImage;
    sink;
    /** content-addressed 描述缓存（attachmentId → 描述），跨 stream() 调用共享。 */
    cache;
    /** 由 vision 构造的 describeImage（未配置 → 引导占位符；已配置 → describe 引擎，含超时降级）。 */
    describeImage;
    constructor(options) {
        super();
        this.vision = options.vision;
        this.delegate = options.delegate;
        this.readImage = options.readImage;
        this.sink = options.sink;
        this.cache = options.cache ?? new Map();
        this.describeImage = (0, stream_core_1.buildDescribeImage)(options.vision, describe_1.describe);
    }
    /** providerInfo：id 等于 route 键，name 供 Web UI 选择器分组展示。 */
    providerInfo(provider) {
        return (0, route_1.buildProviderInfo)(provider);
    }
    /** listModels：广告模型目录（选择器数据来源），每个都带 image 能力声明。 */
    listModels(provider) {
        return Promise.resolve((0, route_1.listRouteModels)(provider));
    }
    /** resolveModel：admission 的能力查询入口，对任意 model 都声明 image 能力。 */
    resolveModel(provider, model) {
        return Promise.resolve((0, route_1.resolveRouteModel)(provider, model));
    }
    /**
     * stream：翻译整段消息历史里的 ImageBlock 为文字后委托 deepseek 主文本模型。
     * - 读图字节（readImage）→ 视觉描述（describeImage）→ translateMessages 翻译（含嵌套 tool-result 图）；
     * - image/described 记录经 sink 落 session log + 诊断日志（缓存命中的记录同样落 log）；
     * - 纯文本历史零改动（translateMessages 返回原 messages 数组），委托体验等同直连 deepseek；
     * - provider 重写为 deepseek-official，model/其余字段透传。任何视觉失败都不抛错、不中断会话。
     */
    async *stream(options) {
        const { messages, records } = await (0, stream_core_1.translateMessages)(options.messages, {
            readImage: this.readImage,
            describeImage: this.describeImage,
            cache: this.cache,
        });
        (0, stream_core_1.emitImageDescribed)(this.sink, options.sessionId, records);
        yield* this.delegate((0, route_1.toDelegateOptions)({ ...options, messages }));
    }
}
exports.PeriscopeBridgeAdapter = PeriscopeBridgeAdapter;
