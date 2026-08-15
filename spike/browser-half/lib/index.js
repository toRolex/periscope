/**
 * spike #32 即弃最小包 —— server host-half（cordis 插件，dsh.bundle 装载）。
 *
 * 职责只有一件：注册一个临时 settings 命名空间 `spike-visual`（单字段 endpoint），
 * 让 browser half 能经 settings 网关（api.settings.describe / mutate）读写它，
 * 最终由 settings-file provider 落 ~/.dsh/settings.yaml。
 *
 * 注意（spike 实证结论）：这里不用、也用不了 issue 设想的 `harness.handle(method, fn)`。
 * `harness.handle` / `host.call` 是 cordis 动态包（tool-cordis / cordis-host-runner /
 * cordis-client-runner，模型运行时 define 的沙盒包）专属 RPC；`file:` 安装、声明
 * `dsh.client` 的包走的是 client-modules 装载面（机制 B），其 server half 是一个普通
 * cordis 插件，直接持有 ctx.settings 服务。settings 的读写传输由 dsh 内建的 settings
 * 网关面承担，无需包内自架 RPC。
 */
import z from '@deepseek-ai/schemastery'

/** Stable Cordis plugin name. */
export const name = 'dsh-spike-browser-half'

/** 等 settings 服务（dsh-settings-file，dsh-base 层）就绪后再注册命名空间。 */
export const inject = ['settings']

/**
 * @param ctx - host 插件上下文（真实 cordis ctx，非动态包沙盒）。
 */
export function apply(ctx) {
  // 单方法 / 临时命名空间 / 硬编码字段 —— 证明往返即可，完整 schema 归后续 ticket。
  ctx.settings.register('spike-visual', z.object({
    endpoint: z.string().default(''),
  }))
  ctx.logger.info('[spike#32] host half up: settings namespace "spike-visual" registered')
}
