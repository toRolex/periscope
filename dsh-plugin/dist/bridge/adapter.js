import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import { describe } from '../core/describe.js';
import { buildDescribeImage, emitImageDescribed, translateMessages, } from './stream-core.js';
import { buildProviderInfo, listRouteModels, resolveRouteModel, toDelegateOptions, } from './route.js';
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
export class PeriscopeBridgeAdapter extends LlmAdapter {
    /** 解析视觉端点配置的函数面（settings/cordis/env 三来源，每次请求实时解析）。 */
    resolveVision;
    delegate;
    readImage;
    sink;
    /** content-addressed 描述缓存（attachmentId → 描述），跨 stream() 调用共享。 */
    cache;
    /** 按最新 vision 构造的 describeImage（未配置 → 引导占位符；已配置 → describe 引擎，含超时降级）。 */
    describeImage;
    constructor(options) {
        super();
        this.resolveVision = options.resolveVision;
        this.delegate = options.delegate;
        this.readImage = options.readImage;
        this.sink = options.sink;
        this.cache = options.cache ?? new Map();
        // 每次调用按最新 vision 构造 describeImage：settings/cordis/env 变更立即生效；apiKey 异步解析。
        this.describeImage = async (bytes, intent) => buildDescribeImage(await this.resolveVision(), describe)(bytes, intent);
    }
    /** providerInfo：id 等于 route 键，name 供 Web UI 选择器分组展示。 */
    providerInfo(provider) {
        return buildProviderInfo(provider);
    }
    /** listModels：广告模型目录（选择器数据来源），每个都带 image 能力声明。 */
    listModels(provider) {
        return Promise.resolve(listRouteModels(provider));
    }
    /** resolveModel：admission 的能力查询入口，对任意 model 都声明 image 能力。 */
    resolveModel(provider, model) {
        return Promise.resolve(resolveRouteModel(provider, model));
    }
    /**
     * stream：翻译整段消息历史里的 ImageBlock 为文字后委托 deepseek 主文本模型。
     * - 读图字节（readImage）→ 视觉描述（describeImage）→ translateMessages 翻译（含嵌套 tool-result 图）；
     * - image/described 记录经 sink 落 session log + 诊断日志（缓存命中的记录同样落 log）；
     * - 纯文本历史零改动（translateMessages 返回原 messages 数组），委托体验等同直连 deepseek；
     * - provider 重写为 deepseek-official，model/其余字段透传。任何视觉失败都不抛错、不中断会话。
     */
    async *stream(options) {
        const { messages, records } = await translateMessages(options.messages, {
            readImage: this.readImage,
            describeImage: this.describeImage,
            cache: this.cache,
        });
        emitImageDescribed(this.sink, options.sessionId, records);
        yield* this.delegate(toDelegateOptions({ ...options, messages }));
    }
}
