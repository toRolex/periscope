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
  import type { SettingsProvider } from '@deepseek-ai/dsh-settings';
  import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';

  /** 日志面（桥接壳用于诊断，最小化）。 */
  export interface Logger {
    error(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    info(...args: unknown[]): void;
  }

  /**
   * durable attachment 服务（issue #25 源码核实：cordis Service 挂点，抽象面四件
   * imageLimits / validateImage / saveImage / readImage）。本票只用 readImage 按 ref 取字节。
   * 源码核实：readImage(ref, signal?) 返回 StoredImageAttachment { ref, data }（data 为字节），
   * 不是裸 Uint8Array——本声明只声明本插件消费的最小面 { data }，壳层取 .data 后注入 seam。
   */
  export interface AttachmentStore {
    readImage(ref: unknown, signal?: unknown): Promise<{ data: Uint8Array }>;
  }

  /**
   * dsh 凭据服务（@deepseek-ai/dsh-credentials，经 ctx.get('credentials') 逃逸口取；可选）。
   * 本插件只消费 resolve：按 apiKeyEnv 解析出字面 key，先于 process.env 兜底（与 llm-deepseek 适配器同策略）。
   * ResolvedCredential 字段很多，本声明只声明本插件消费的最小面 { value }。
   */
  export interface CredentialsService {
    resolve(ref: string): Promise<{ value: string } | undefined>;
  }

  /**
   * cordis 插件上下文。llm / attachments / logger 为源码核实的必给服务挂点；
   * settings / connection 经 inject 可选挂载（见 #33：installSettingsSection 与 connection RPC），
   * 声明为可选以反映「缺省时插件以 cordis.yml + env 工作」的真实性。
   * 会话服务经通用 get('sessions') 逃逸口取（推断挂点，见 plugin.ts 注释——手工 E2E 首要核实地）。
   */
  export class Context {
    llm: LlmService;
    logger: Logger;
    attachments: AttachmentStore;
    settings?: SettingsProvider;
    connection?: HostConnectionHandle;
    get(name: string): unknown;
    /**
     * 依赖服务就绪后运行回调（cordis 源码核实的注入面，installSettingsSection 也用它）。
     * 最小面：数组形式的服务名；回调收注入后的 scoped Context。
     */
    inject(deps: readonly string[], callback: (ctx: Context) => void): unknown;
  }
}

/**
 * 会话事件类型表（issue #25 核实：SessionEventMap 为 merge-extensible 普通 interface，
 * 第三方插件经 declaration merging 以「属性形式直接声明」扩展，禁 extends/方法形式）。
 * 本包据此扩展 log-only 事件 image/described（attachmentId → 描述），翻译时 append 落 session log。
 */
declare module '@deepseek-ai/dsh-session/types' {
  export interface SessionEventMap {
    /** log-only：一张图片的视觉描述（含缓存命中与失败降级占位符）。 */
    'image/described': { attachmentId: string; description: string };
  }
}

declare module '@deepseek-ai/dsh-session' {
  import type { SessionEventMap } from '@deepseek-ai/dsh-session/types';

  export type SessionEventType = keyof SessionEventMap;

  /**
   * 会话句柄：append-only 事件 log。log-only 事件 append(type, data) 不带 surface 元数据。
   * ⚠️ 持久化限制（issue #24 核实）：append 无法标 ignorable，image/described 不在仓内生成的
   * KNOWN_SESSION_EVENT_TYPES，含该事件的会话「进程重启后重载」会被持久化层整体拒载。
   */
  export interface Session {
    append<K extends SessionEventType>(type: K, data: SessionEventMap[K]): void;
  }

  /**
   * 会话服务（推断 API：按 id 取会话句柄）。真实挂点/方法名以 dsh 运行时为准——
   * 这是本票手工 E2E 的首要核实地（见 plugin.ts 注释与汇报）。
   */
  export interface SessionService {
    get(sessionId: string): Session | undefined;
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
  export default Schema;
}

declare module '@deepseek-ai/dsh-settings' {
  import type { Context } from '@deepseek-ai/cordis';

  /** settings 命名空间品牌（小写 kebab-case，如 `periscope`）。 */
  export type SettingsNamespace = string & { readonly __settingsNamespace?: unique symbol };

  /** 把原始字符串品牌化为 SettingsNamespace；不匹配 `^[a-z][a-z0-9-]*$` 时抛 TypeError。 */
  export function settingsNamespace(value: string): SettingsNamespace;

  /** installSettingsSection 的消费方钩子。 */
  export interface SettingsSectionHooks<T> {
    /** 接收当前配置来源：settings 作用域就位时为解析后的作用域，否则为 composition entry。 */
    setSource(current: () => T): void;
    /** attach / detach / 已提交变更后重新裁决任何派生事实。 */
    onChange(): void;
    /** 拒绝一个 schema 无法表达的不可服务 section（可选）。 */
    validate?(value: T): void;
  }

  /** 一个已注册命名空间的 owner 面。 */
  export interface SettingsScope<T> {
    /** 当前解析值：schema 默认 → base 层 → user 层。 */
    get(): T;
    watch(callback: (next: T, prev: T) => void | Promise<void>): () => void;
    /** 合并 patch 进 user 层并持久化。 */
    update(patch: object): Promise<void>;
    /** 整体替换 user 层；缺省 key 重新继承 base/schema 默认。 */
    replace(section: object): Promise<void>;
  }

  /** describe() 返回的一个命名空间描述（配置面视角的最小面）。 */
  export interface SettingsDescriptor {
    ns: SettingsNamespace;
    schema: unknown;
    /** 当前解析值。 */
    value: unknown;
    /** 该描述读取时刻的 raw user section revision（写回作 expectedRevision）。 */
    revision: number;
    base?: unknown;
    user?: unknown;
    applies: 'live' | 'restart';
    secrets?: unknown[];
  }

  /**
   * settings 服务（user-settings capability seam 的 provider）。register 注册命名空间
   * schema；update/replace 写 user 层并持久化；describe 枚举已注册命名空间。
   */
  export class SettingsProvider {
    get(ns: SettingsNamespace): unknown;
    update(ns: SettingsNamespace, patch: object, expectedRevision?: number): Promise<void>;
    replace(ns: SettingsNamespace, section: object, expectedRevision?: number): Promise<void>;
    describe(options?: { redactSecrets?: boolean }): SettingsDescriptor[];
  }

  /**
   * 安装 canonical 可选 settings 消费方接线：settings 服务存在时注册 ns（entry 为 base 层、
   * 写入为 user 层），并把 source 指到解析后的作用域；服务卸载时回退到 entry。注册骑在
   * scoped fiber 上，故无 settings 服务时本函数什么也不跑。
   */
  export function installSettingsSection<T>(
    ctx: Context,
    ns: SettingsNamespace,
    schema: unknown,
    entry: T,
    hooks: SettingsSectionHooks<T>,
  ): void;
}

declare module '@deepseek-ai/dsh-client-connection' {
  /** RPC 结果面（对齐 @deepseek-ai/dsh-host-apiproxy/api 的 RpcResult<T> 最小契约）。 */
  export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string; details: unknown } };

  /** 一个逻辑 RPC channel 的信任策略。 */
  export type ConnectionRpcAuthority = 'trusted-host' | 'loopback';

  /** 一个逻辑 RPC channel 的注册选项。 */
  export interface ConnectionRpcHandlerOptions {
    /** 本 channel 每个端点接受的浏览器 authority。 */
    readonly authority: ConnectionRpcAuthority;
  }

  /** Connection 解码传输信封后调用的 handler。 */
  export type ConnectionRpcHandler = (
    endpoint: string,
    payload: unknown,
    signal: AbortSignal,
  ) => Promise<RpcResult<unknown>>;

  /** Host 端逻辑 RPC channel 注册表。 */
  export interface HostConnectionRpc {
    /**
     * 注册一个绝对 channel 前缀与其信任策略。
     * @param channel - 绝对逻辑 channel，如 `/periscope`。
     * @param handler - 解码后的 endpoint handler，返回既有 RPC result 形状。
     * @param options - channel 信任策略。
     * @returns 移除该 channel 及其物理路由的异步 disposer。
     */
    handle(channel: string, handler: ConnectionRpcHandler, options: ConnectionRpcHandlerOptions): () => Promise<void>;
  }

  /** Host `ctx.connection` 的形状。 */
  export interface HostConnectionHandle {
    readonly rpc: HostConnectionRpc;
  }
}
