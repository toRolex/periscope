/**
 * dsh（deepseek-harness）三方包的最小 ambient 声明，供离线编译本包的 dsh 集成壳
 * （adapter.ts / plugin.ts）。与 src/global.d.ts 同策略（issue #2 红线：devDependencies
 * 仅 typescript，不安装真实 dsh 包——它们是开发者预览、接口在变，且运行时由 dsh 宿主提供，
 * 故在 package.json 里列为 peerDependencies）。
 *
 * 类型面按 issue #25 核实报告 @ pin 47f94385 的真实 `.d.ts` 提取并**按需简化**（brand /
 * reasoning / retry 等本票不碰的细节收窄为 string / 省略）。真实包在 dsh 宿主运行时就位，
 * 这里的声明只是编译期的最小稳定契约；dsh 接口演进时只需更新本文件。
 *
 * 注意：纯逻辑模块（bridge/route.ts、bridge/vision-config.ts）**不** import 本文件的任何
 * 模块——它们自定义结构兼容的最小类型，以保持离线可单测。本文件只服务于壳层。
 */

declare module '@deepseek-ai/dsh-llm' {
  /** 输入模态（text / image）。 */
  export type ModelModality = 'text' | 'image';

  /** 提供方路由的展示元数据。 */
  export interface LlmProviderInfo {
    id: string;
    name: string;
  }

  /** 一个广告模型的元数据；inputModalities 显式缺省 image 才是 admission 的负能力。 */
  export interface LlmModelInfo {
    provider: string;
    id: string;
    name: string;
    description?: string;
    inputModalities?: readonly ModelModality[];
  }

  /** 精确模型的解析结果（admission 查 inputModalities 的入口）。 */
  export interface LlmResolvedModelInfo extends LlmModelInfo {}

  /** 内容块（本票只整体转发，不逐个构造）。 */
  export type ContentBlock = { type: string } & Record<string, unknown>;

  /** 一条消息（桥接层原样转发，不构造）。 */
  export interface Message {
    readonly role: 'system' | 'user' | 'assistant';
    readonly content: ContentBlock[];
  }

  /** token 计量（桥接层只转发）。 */
  export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
  }

  /** 结束原因（桥接层只转发）。 */
  export type FinishReason = { kind: string };

  /** 流式块联合（桥接层经 yield* 原样转发）。 */
  export type StreamChunk =
    | { type: 'block-start'; index: number; blockType: string }
    | { type: 'text-delta'; index: number; text: string }
    | { type: 'reasoning-delta'; index: number; text: string }
    | { type: 'tool-call-delta'; index: number; id: string; name?: string; argumentsDelta: string }
    | { type: 'block-end'; index: number; block: ContentBlock }
    | { type: 'usage'; usage: TokenUsage }
    | { type: 'finish'; reason: FinishReason; replayState?: unknown };

  /** 工具 schema（桥接层只转发）。 */
  export interface ToolSchema {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }

  /** 一次完全装配的模型请求。 */
  export interface GenerateOptions {
    provider: string;
    model: string;
    reasoningEffort?: string;
    messages: Message[];
    system?: string;
    tools?: ToolSchema[];
    temperature?: number;
    maxTokens?: number;
    stop?: string[];
    signal?: unknown;
    sessionId?: string;
    purpose?: 'compaction' | 'session-title';
  }

  /**
   * provider 后端适配器抽象类。唯一抽象方法 stream()；providerInfo / listModels /
   * resolveModel 在真实类里有默认实现，桥接适配器覆写它们以声明 image 能力。
   */
  export abstract class LlmAdapter {
    providerInfo(provider: string): LlmProviderInfo;
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo>;
    abstract stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
  }

  /** registerAdapter 的返回句柄：disposer + 原子换路由。 */
  export interface AdapterRegistrationHandle {
    (): void;
    replace(providers: string[]): void;
  }

  /** ctx.llm 服务：适配器注册表 + 流式调用面。 */
  export class LlmService {
    registerAdapter(providers: string[], adapter: LlmAdapter): AdapterRegistrationHandle;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
  }
}

declare module '@deepseek-ai/cordis' {
  import type { LlmService } from '@deepseek-ai/dsh-llm';

  /** 日志面（桥接壳用于诊断，最小化）。 */
  export interface Logger {
    error(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    info(...args: unknown[]): void;
  }

  /** cordis 插件上下文（本票只用到 llm 服务与 logger）。 */
  export class Context {
    llm: LlmService;
    logger: Logger;
    get(name: string): unknown;
  }
}

declare module '@deepseek-ai/schemastery' {
  /**
   * schemastery 的链式 schema（最小面）。真实库为 `export = Schema`（CommonJS），
   * 默认导出即 Schema 静态面。本票只用 object/string/union 构造 cordis.yml 校验 schema；
   * 默认值与 env fallback 在 vision-config.ts 的纯函数里处理，不依赖 schema 链。
   */
  export interface ZSchema<T = unknown> {
    required(): ZSchema<T>;
    default(value: T): ZSchema<T>;
    role(text: string): ZSchema<T>;
    description(text: string): ZSchema<T>;
  }

  export interface SchemaStatic {
    object(dict: Record<string, unknown>): ZSchema;
    string(): ZSchema<string>;
    number(): ZSchema<number>;
    boolean(): ZSchema<boolean>;
    union(list: readonly unknown[]): ZSchema;
    array(inner: unknown): ZSchema<unknown[]>;
  }

  const Schema: SchemaStatic;
  export = Schema;
}
