import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  StreamChunk,
} from '@deepseek-ai/dsh-llm';
import { ResolvedVisionConfig } from './vision-config';
import {
  buildProviderInfo,
  listRouteModels,
  resolveRouteModel,
  toDelegateOptions,
} from './route';

/**
 * 把一次模型调用委托给主文本模型的函数面（壳层由 ctx.llm.stream 注入，见 plugin.ts）。
 * 走服务内分发：provider 已被 toDelegateOptions 重写为 deepseek 主文本路由，故分发到
 * 已注册的 deepseek 适配器，不回流到本桥、不重走 admission。
 */
export type StreamDelegate = (options: GenerateOptions) => AsyncIterable<StreamChunk>;

export interface PeriscopeBridgeOptions {
  /** 解析好的视觉端点配置。 */
  vision: ResolvedVisionConfig;
  /** 委托函数（宿主注入 ctx.llm.stream）。 */
  delegate: StreamDelegate;
}

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
export class PeriscopeBridgeAdapter extends LlmAdapter {
  /**
   * 解析好的视觉端点配置（cordis.yml + env fallback，apiKey 仅从 env）。
   * 本票不消费——保留供 #28 桥接核心翻译 ImageBlock 时读取。
   */
  readonly vision: ResolvedVisionConfig;

  private readonly delegate: StreamDelegate;

  constructor(options: PeriscopeBridgeOptions) {
    super();
    this.vision = options.vision;
    this.delegate = options.delegate;
  }

  /** providerInfo：id 等于 route 键，name 供 Web UI 选择器分组展示。 */
  providerInfo(provider: string): LlmProviderInfo {
    return buildProviderInfo(provider);
  }

  /** listModels：广告模型目录（选择器数据来源），每个都带 image 能力声明。 */
  listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(listRouteModels(provider));
  }

  /** resolveModel：admission 的能力查询入口，对任意 model 都声明 image 能力。 */
  resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve(resolveRouteModel(provider, model));
  }

  /**
   * stream：纯文本 prompt 原样委托 deepseek 主文本模型（provider 重写为 deepseek-official，
   * model/messages/其余字段透传）。带图 prompt 本票不翻译，图片块随 messages 原样带向
   * deepseek（翻译归 #28）。
   */
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    yield* this.delegate(toDelegateOptions(options));
  }
}
