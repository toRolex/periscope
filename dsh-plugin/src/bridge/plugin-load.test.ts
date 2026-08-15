import { test } from 'node:test';

/**
 * ESM 加载回归（#ESM）：dsh 的 Cordis loader 用 Promise.allSettled 并行 import 所有插件。
 * 包为 CommonJS 且 adapter 顶层同步 require('@deepseek-ai/dsh-llm')（ESM 包）时，会撞上并行
 * import 未完成的 dsh-llm，抛 ERR_REQUIRE_ESM_RACE_CONDITION 导致 periscope-deepseek 加载失败。
 * 包转 ESM 后 adapter 顶层为静态 import，依赖由 ESM loader 解析，竞态消失。
 * 本测试锁定：插件入口在并行加载 dsh-llm 时不再触发该错误。
 */
test('插件入口在并行加载 dsh-llm 时无 ERR_REQUIRE_ESM_RACE_CONDITION', async () => {
  const results = await Promise.allSettled([
    import('@deepseek-ai/dsh-llm'),
    import('./plugin.js'),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') {
      throw new Error(`模块加载失败: ${r.reason?.code ?? r.reason}`);
    }
  }
});
