/**
 * periscope-deepseek route 的纯逻辑：能力声明元数据与委托选项改写。
 *
 * 零 dsh 运行时耦合——本模块自定义与 dsh 结构兼容的最小类型（RouteProviderInfo /
 * RouteModelInfo 的形状对齐 dsh 的 LlmProviderInfo / LlmModelInfo），壳层
 * （adapter.ts）把它们作为 dsh 类型返回。全部可离线单测。
 *
 * 已源码核实（issue #25，pin 47f94385）：
 * - admission 查的是 adapter 自报的 inputModalities，显式缺省 image 才拒绝；声明即放行。
 * - 委托经 ctx.llm.stream({ provider: 'deepseek-official' }) 直达已注册的 deepseek
 *   适配器（服务内分发，不重走 admission）；「harness 模型名即线协议模型名」，
 *   故 model 原样透传即可。
 */

/** 输入模态（对齐 dsh ModelModality）。 */
export type Modality = 'text' | 'image';

/** 自解释 route id：Web UI 模型选择器里用户显式选择的提供方键。 */
export const PERISCOPE_PROVIDER = 'periscope-deepseek';

/** 委托目标：dsh 已注册的 deepseek 主文本路由（issue #25 核实的 route key）。 */
export const DELEGATE_PROVIDER = 'deepseek-official';

/** 本 route 声明的输入能力：含 image（带图 prompt 过 admission），也含 text。 */
export const INPUT_MODALITIES: readonly Modality[] = ['text', 'image'];

/** 选择器里的提供方分组显示名（自解释：看图桥 → deepseek）。 */
export const PROVIDER_DISPLAY_NAME = 'periscope（看图桥 → deepseek）';

/** 一个广告模型（选择器条目）。id 沿用 deepseek 线协议 id，使委托时 model 原样透传。 */
export interface RouteModel {
  id: string;
  name: string;
}

/** 默认广告的模型目录（镜像 deepseek 主文本模型的两个默认档，附 image 能力）。 */
export const PERISCOPE_MODELS: readonly RouteModel[] = [
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash（periscope 桥）' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro（periscope 桥）' },
];

/** 提供方展示元数据（形状对齐 dsh LlmProviderInfo）。 */
export interface RouteProviderInfo {
  id: string;
  name: string;
}

/** 模型元数据（形状对齐 dsh LlmModelInfo / LlmResolvedModelInfo 的能力面）。 */
export interface RouteModelInfo {
  provider: string;
  id: string;
  name: string;
  inputModalities: readonly Modality[];
}

/** providerInfo：id 必须等于 route 键，name 供选择器/诊断展示。 */
export function buildProviderInfo(provider: string): RouteProviderInfo {
  return { id: provider, name: PROVIDER_DISPLAY_NAME };
}

/** 单个模型的元数据：挂上 image 能力声明。 */
export function buildModelInfo(provider: string, model: RouteModel): RouteModelInfo {
  return { provider, id: model.id, name: model.name, inputModalities: INPUT_MODALITIES };
}

/** listModels：广告本 route 的模型目录（Web UI 选择器数据来源）。 */
export function listRouteModels(provider: string): RouteModelInfo[] {
  return PERISCOPE_MODELS.map((model) => buildModelInfo(provider, model));
}

/**
 * resolveModel：admission 的能力查询入口。catalog 是 advisory，未知 id 也要声明
 * image 能力（缺省 image 才会被拒），故未知模型按 id 原样放行并附能力声明。
 */
export function resolveRouteModel(provider: string, modelId: string): RouteModelInfo {
  const found = PERISCOPE_MODELS.find((m) => m.id === modelId);
  return buildModelInfo(provider, found ?? { id: modelId, name: modelId });
}

/**
 * 委托改写：仅把 provider 重写为 deepseek 主文本路由；model/messages/其余字段原样透传。
 * 泛型保持入参形状，返回新对象、不改写入参。
 *
 * 调用前 adapter 的 stream()（#29）已把 messages 里的 ImageBlock 译为 `[Image N] 描述` 文字，
 * 故到达本函数的 messages 对 deepseek 主文本模型可直接消费；本函数不再感知图片。
 */
export function toDelegateOptions<T extends { provider: string }>(options: T): T {
  return { ...options, provider: DELEGATE_PROVIDER };
}
