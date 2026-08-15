import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  StreamChunk,
} from '@deepseek-ai/dsh-llm';
import { describe } from '../core/describe.js';
import { ResolvedVisionConfig } from './vision-config.js';
import {
  ImageDescribedSink,
  buildDescribeImage,
  emitImageDescribed,
  translateMessages,
} from './stream-core.js';
import {
  buildProviderInfo,
  listRouteModels,
  resolveRouteModel,
  toDelegateOptions,
} from './route.js';

/**
 * 把一次模型调用委托给主文本模型的函数面（壳层由 ctx.llm.stream 注入，见 plugin.ts）。
 * 走服务内分发：provider 已被 toDelegateOptions 重写为 deepseek 主文本路由，故分发到
 * 已注册的 deepseek 适配器，不回流到本桥、不重走 admission。
 */
export type StreamDelegate = (options: GenerateOptions) => AsyncIterable<StreamChunk>;

/** 按 attachment 引用读图片字节的函数面（壳层由 ctx.attachments.readImage 注入）。 */
export type ReadImage = (attachment: unknown) => Promise<Uint8Array>;

export interface PeriscopeBridgeOptions {
  /** 解析好的视觉端点配置。 */
  vision: ResolvedVisionConfig;
  /** 委托函数（宿主注入 ctx.llm.stream）。 */
  delegate: StreamDelegate;
  /** 读图字节（宿主注入 ctx.attachments.readImage）。 */
  readImage: ReadImage;
  /** image/described 落点（宿主注入 session append + 诊断日志；绝不抛错）。 */
  sink: ImageDescribedSink;
  /**
   * 可选 content-addressed 缓存（attachmentId → 描述）。缺省新建。
   * 壳层应注入适配器级共享 Map，使同图再发 / 历史重放跨 stream() 命中、不重复请求下游。
   */
  cache?: Map<string, string>;
}

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
  /** 解析好的视觉端点配置（cordis.yml + env fallback，apiKey 仅从 env）。 */
  readonly vision: ResolvedVisionConfig;

  private readonly delegate: StreamDelegate;
  private readonly readImage: ReadImage;
  private readonly sink: ImageDescribedSink;
  /** content-addressed 描述缓存（attachmentId → 描述），跨 stream() 调用共享。 */
  private readonly cache: Map<string, string>;
  /** 由 vision 构造的 describeImage（未配置 → 引导占位符；已配置 → describe 引擎，含超时降级）。 */
  private readonly describeImage: (bytes: Uint8Array, intent?: string) => Promise<string>;

  constructor(options: PeriscopeBridgeOptions) {
    super();
    this.vision = options.vision;
    this.delegate = options.delegate;
    this.readImage = options.readImage;
    this.sink = options.sink;
    this.cache = options.cache ?? new Map<string, string>();
    this.describeImage = buildDescribeImage(options.vision, describe);
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
   * stream：翻译整段消息历史里的 ImageBlock 为文字后委托 deepseek 主文本模型。
   * - 读图字节（readImage）→ 视觉描述（describeImage）→ translateMessages 翻译（含嵌套 tool-result 图）；
   * - image/described 记录经 sink 落 session log + 诊断日志（缓存命中的记录同样落 log）；
   * - 纯文本历史零改动（translateMessages 返回原 messages 数组），委托体验等同直连 deepseek；
   * - provider 重写为 deepseek-official，model/其余字段透传。任何视觉失败都不抛错、不中断会话。
   */
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const { messages, records } = await translateMessages(options.messages, {
      readImage: this.readImage,
      describeImage: this.describeImage,
      cache: this.cache,
    });
    emitImageDescribed(this.sink, options.sessionId, records);
    yield* this.delegate(toDelegateOptions({ ...options, messages }));
  }
}
