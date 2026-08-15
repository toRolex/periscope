import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import { PeriscopeBridgeAdapter } from './adapter';
import { PERISCOPE_PROVIDER } from './route';
import { VisionConfigInput, resolveVisionConfig } from './vision-config';

/**
 * periscope 的 dsh 原生插件入口（cordis 插件形态，对齐官方 llm-deepseek 适配器的导出形状）。
 *
 * cordis 加载本模块时读取这四个命名导出：name / inject / Config（schemastery schema，
 * 校验 cordis.yml 里本插件的配置段）/ apply（入口，注册 periscope-deepseek route）。
 * 另附 default 导出同一插件对象，规避 ESM 宿主 import CommonJS 时命名导出探测的边界。
 *
 * ──────────────────────────── 手工 E2E 验收（无法 CI 自动化，需真实 dsh 宿主） ────────────────────────────
 * 前置：本机已装 dsh CLI（@deepseek-ai/dsh）、pnpm；deepseek 主文本路由可用（DEEPSEEK_API_KEY 已 export，
 *       或 web Models 页已配置 llm-deepseek 段）。本包为 CommonJS，dsh 插件生态全为 ESM——若加载期
 *       因模块格式被拒，按「风险」小节的说明把插件入口转为 ESM。
 *
 * 1) 构建：在本包目录 `npm run build`（tsc 产出 dist/；本包提交 dist/ 以支持 git/file 免构建安装）。
 * 2) 安装到 web profile：`dsh plugin --profile web add file:<本包绝对路径>`
 *    - dsh 用 pnpm 把本包装进 profile 的 node_modules，并因本包 package.json 声明了
 *      `dsh.bundle.patch`（指向 ./cordis.patch.yml）而自动把包名追加进 `dsh.profile.bundles`。
 *    - 可用 `dsh --profile web --dump-config` 复查组合后的树里出现了 periscope-deepseek 行。
 * 3) 配置视觉端点（本票只验证「解析就绪」，不触发视觉调用）：
 *    - 方式 A（cordis.yml）：在 profile 的 cordis.patch.yml 给 periscope-deepseek 行加 config
 *      （protocol / baseUrl / model / apiKeyEnv，apiKey 不写进配置）。
 *    - 方式 B（env fallback）：export PERISCOPE_VISION_PROTOCOL / PERISCOPE_VISION_BASE_URL /
 *      PERISCOPE_VISION_MODEL；apiKey 仅从 env：export PERISCOPE_API_KEY=sk-...（或 apiKeyEnv 指定的变量）。
 * 4) 启动 Web UI：`dsh web`，打开浏览器会话。
 * 5) 【验收点 1：route 出现】模型选择器里出现提供方「periscope（看图桥 → deepseek）」
 *    （route id `periscope-deepseek`），其下可选 deepseek-v4-flash / deepseek-v4-pro。
 * 6) 【验收点 2：纯文本委托】选中该 route 的模型，发一条纯文本 prompt；桥把 provider 重写为
 *    deepseek-official 委托主文本模型，流式往返——体验等同直连 deepseek route。
 * 7) 【验收点 3：image 能力放行 admission】发一条带图 prompt；不应在 admission 报
 *    "Model ... does not support image input"（本 route 已声明 image 能力）。
 *    注意：本票不翻译图片——图片块原样带向 deepseek，deepseek 文本端可能无法正常处理图片；
 *    看图翻译归后续票 #28/#29。本验收点只确认「不在 admission 被拒」。
 * 8) 【验收点 4：apiKey 仅从 env】把视觉 key 只经 env（PERISCOPE_API_KEY）提供、cordis.yml 不写
 *    apiKey；`--dump-config` 确认配置段无字面 key。
 *
 * 风险（开发者预览，接口在变；详见 docs/adr/0003 假设清单）：
 * - 模块格式：dsh 插件均为 ESM，本包为 CommonJS。Node 的 CJS→ESM 互操作一般能探测到
 *   命名导出（tsc 产出 __esModule + exports.*），default 导出是双保险；若宿主加载仍失败，
 *   将本插件入口单独转 ESM（后续切片，不阻塞本骨架）。
 * - 委托依赖 base bundle 已注册 deepseek-official 路由（dsh-base 默认含 llm-deepseek 行）。
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 */

/** 插件名（cordis 纤维诊断与 logger 命名）。 */
export const name = 'periscope-deepseek';

/** 依赖的 cordis 服务：llm（注册适配器 + 委托主文本模型都要它）。 */
export const inject = ['llm'];

/**
 * 插件配置类型：视觉端点配置项（protocol / baseUrl / model / apiKeyEnv），全部可选。
 * 刻意不含 apiKey——key 仅从 env 读取（apiKeyEnv 命名的环境变量），字面 key 不是配置值。
 */
export interface Config extends VisionConfigInput {}

/**
 * cordis.yml 配置段的 schemastery 校验 schema（对齐 Config 类型，全可选）。
 * 默认值与 env fallback 不在 schema 链里处理，而由 resolveVisionConfig 纯函数统一裁决。
 */
export const Config = Schema.object({
  protocol: Schema.union(['openai', 'anthropic', 'responses']),
  baseUrl: Schema.string(),
  model: Schema.string(),
  apiKeyEnv: Schema.string(),
});

/**
 * 插件入口：解析视觉端点配置（cordis.yml + env fallback，apiKey 仅从 env）→ 构造桥接适配器
 * （委托函数注入 ctx.llm.stream）→ 注册 periscope-deepseek route。
 * 配置解析在此证明就绪，但本票不把 vision 接入 stream()（归 #28）。
 */
export function apply(ctx: Context, config: Config): void {
  const vision = resolveVisionConfig(config, process.env);
  const adapter = new PeriscopeBridgeAdapter({
    vision,
    delegate: (options: GenerateOptions): AsyncIterable<StreamChunk> => ctx.llm.stream(options),
  });
  ctx.llm.registerAdapter([PERISCOPE_PROVIDER], adapter);
}

/** default 导出同一插件对象（CommonJS 被 ESM 宿主 import 时的兜底，见上注释）。 */
export default { name, inject, Config, apply };
