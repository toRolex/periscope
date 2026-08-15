"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PeriscopeBridgeAdapter = void 0;
const dsh_llm_1 = require("@deepseek-ai/dsh-llm");
const route_1 = require("./route");
/**
 * periscope 的 dsh 桥接适配器：一个声明 image 输入能力的 LlmAdapter。
 *
 * 本票（#27）是先行垂直脊柱，stream() 只做纯文本原样转发 + 委托 deepseek 主文本模型；
 * 视觉端点配置已解析就绪（vision）但暂不消费——把 ImageBlock 译成文字归桥接核心票 #28，
 * 看图放行 admission 已由 listModels/resolveModel 的 image 能力声明打通。
 *
 * 本类是 dsh 集成壳（extends 真实 LlmAdapter），只在 dsh 宿主运行时加载，不进离线单测；
 * 可测的纯逻辑都在 route.ts / vision-config.ts。
 */
class PeriscopeBridgeAdapter extends dsh_llm_1.LlmAdapter {
    /**
     * 解析好的视觉端点配置（cordis.yml + env fallback，apiKey 仅从 env）。
     * 本票不消费——保留供 #28 桥接核心翻译 ImageBlock 时读取。
     */
    vision;
    delegate;
    constructor(options) {
        super();
        this.vision = options.vision;
        this.delegate = options.delegate;
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
     * stream：纯文本 prompt 原样委托 deepseek 主文本模型（provider 重写为 deepseek-official，
     * model/messages/其余字段透传）。带图 prompt 本票不翻译，图片块随 messages 原样带向
     * deepseek（翻译归 #28）。
     */
    async *stream(options) {
        yield* this.delegate((0, route_1.toDelegateOptions)(options));
    }
}
exports.PeriscopeBridgeAdapter = PeriscopeBridgeAdapter;
