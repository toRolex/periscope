import { test } from 'node:test';
import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
/**
 * dist 产物回归（review-36）：settings-rpc.ts 头部 import 若放在模块头注释之前，tsc 会把头注释
 * 视为随后被擦除的 type-only 声明（PeriscopeRpcError）的 leading comment，编译产物丢失整段模块头
 * 注释（旧版 dist 有，本分支曾引入回归）。本测试锁定：dist 产物必须保留模块头注释。
 * 相对 URL 在 src 与 dist 下解析一致：src/bridge → dist/bridge，故读到的正是编译产物。
 * 运行时（pnpm test 先 tsc 再 node --test）读到的是刚构建的 dist，随源码修复即时生效。
 */
test('编译产物 dist/bridge/settings-rpc.js 保留模块头注释', () => {
    const url = new URL('./settings-rpc.js', import.meta.url);
    const source = readFileSync(fileURLToPath(url.href)).toString('utf8');
    assert.match(source, /periscope settings 命名空间的 connection RPC channel（\/periscope）纯逻辑（issue #33）/, '模块头注释不应被当作被擦除类型声明的 leading comment 而丢弃');
});
