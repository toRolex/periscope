import { test } from 'node:test';
import * as assert from 'node:assert';
import { describe } from '../core/describe.js';
import { PNG_1PX_BASE64 } from '../testing/fixtures.js';
import { createMockServer } from '../testing/mock-server.js';
import { makePeriscopeRpcHandler } from './settings-rpc.js';
import { resolveVisionConfigWithSettings } from './vision-config.js';
import { buildDescribeImage } from './stream-core.js';
/**
 * Seam 3 —— 端到端冒烟（issue #35）：settings 写入 → 插件读配置（归并生效值）→
 * describe 请求视觉端点 → mock 端点返回。
 *
 * 复用 testing/mock-server.ts 的离线 openai fixture（与 describe.test.ts 同 seam），全程离线。
 * settings 服务以最小 port 模拟（update 合并写 user 层 / read 读回 user+base+value）；
 * 生效配置解析走与 plugin.ts 相同的 resolveVisionConfigWithSettings（settings > cordis.yml > env）；
 * describe 走真实 core/describe（经 transport 发 HTTP 到 mock server）。壳层（plugin.ts 的
 * connection rpc.handle 接线）归手工 E2E——本测试把同一 handler 纯逻辑面驱动到底。
 */
const PNG_BYTES = Buffer.from(PNG_1PX_BASE64, 'base64');
/** 最小 settings 服务：user 层初始空，base 层（cordis.yml）注入；update 合并写 user。 */
function fakeSettings(base) {
    let user = {};
    return {
        get user() {
            return user;
        },
        read: () => ({ value: { ...base, ...user }, user, base, revision: 0 }),
        update: async (patch) => {
            user = { ...user, ...patch };
        },
    };
}
test('Seam 3 端到端冒烟：settings 写入 → 插件读配置 → describe 视觉端点 → mock 返回', async (t) => {
    const server = await createMockServer({
        defaultBody: JSON.stringify({ choices: [{ message: { content: '端到端冒烟描述' } }] }),
    });
    t.after(() => server.close());
    // cordis.yml（base 层）提供 baseUrl 指向 mock；env 提供 model fallback。
    const base = { baseUrl: server.baseUrl };
    const settings = fakeSettings(base);
    const env = { PERISCOPE_VISION_MODEL: 'env-model' };
    const handler = makePeriscopeRpcHandler(settings, 'periscope', { env });
    // 1) settings 写入（经 RPC update 端点合并写 user 层）
    const updateResult = await handler('update', { patch: { model: 'settings-model' } });
    assert.equal(updateResult.ok, true);
    // 2) 插件读配置：describeEffective 返回归并生效值（settings model > cordis baseUrl > env）
    const effResult = await handler('describeEffective', null);
    assert.equal(effResult.ok, true);
    if (!effResult.ok)
        return;
    const effective = effResult.value;
    assert.equal(effective.value.baseUrl, server.baseUrl, 'cordis baseUrl 生效');
    assert.equal(effective.value.model, 'settings-model', 'settings model 优先于 cordis/env');
    assert.equal(effective.sources.baseUrl, 'cordis');
    assert.equal(effective.sources.model, 'settings');
    assert.equal(effective.configured, true);
    // 3) describe 请求视觉端点 → mock 端点返回（与 plugin.ts 相同的归并解析路径）
    const resolved = resolveVisionConfigWithSettings(base, settings.user, env);
    const describeImage = buildDescribeImage(resolved, describe);
    const text = await describeImage(PNG_BYTES);
    assert.equal(text, '端到端冒烟描述');
    assert.equal(server.requests.length, 1, '视觉端点应恰好收到一次请求');
    const req = server.requests[0];
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/chat/completions');
    const body = req.jsonBody;
    assert.equal(body.model, 'settings-model', 'describe 请求体应使用归并生效的 model');
    assert.equal(body.messages[0].content[1].image_url.url, `data:image/png;base64,${PNG_1PX_BASE64}`, '图片字节应精确 base64 回传进 data URL');
});
test('Seam 3：仅 cordis.yml + env（settings 不写入）→ 生效值回显并完成 describe', async (t) => {
    const server = await createMockServer();
    t.after(() => server.close());
    // 已有 cordis.yml 配置（base 层），env 提供更低优先级 model —— 用户无需重复填写。
    const base = { baseUrl: server.baseUrl, model: 'yml-model' };
    const settings = fakeSettings(base);
    const env = { PERISCOPE_VISION_MODEL: 'env-model' };
    const handler = makePeriscopeRpcHandler(settings, 'periscope', { env });
    const effResult = await handler('describeEffective', null);
    assert.equal(effResult.ok, true);
    if (!effResult.ok)
        return;
    const effective = effResult.value;
    assert.equal(effective.value.baseUrl, server.baseUrl);
    assert.equal(effective.value.model, 'yml-model', 'cordis model 优先于 env fallback');
    assert.equal(effective.sources.baseUrl, 'cordis');
    assert.equal(effective.sources.model, 'cordis');
    assert.equal(effective.configured, true);
    const resolved = resolveVisionConfigWithSettings(base, null, env);
    const describeImage = buildDescribeImage(resolved, describe);
    const text = await describeImage(PNG_BYTES);
    assert.equal(text, 'mock 默认描述');
    assert.equal(server.requests.length, 1);
});
test('Seam 3：仅 env（settings/cordis 均无）→ env 生效值并完成 describe', async (t) => {
    const server = await createMockServer();
    t.after(() => server.close());
    const settings = fakeSettings({});
    const env = { PERISCOPE_VISION_BASE_URL: server.baseUrl, PERISCOPE_VISION_MODEL: 'env-model' };
    const handler = makePeriscopeRpcHandler(settings, 'periscope', { env });
    const effResult = await handler('describeEffective', null);
    assert.equal(effResult.ok, true);
    if (!effResult.ok)
        return;
    const effective = effResult.value;
    assert.equal(effective.value.baseUrl, server.baseUrl, 'env baseUrl 生效');
    assert.equal(effective.value.model, 'env-model', 'env model 生效');
    assert.equal(effective.sources.baseUrl, 'env');
    assert.equal(effective.sources.model, 'env');
    assert.equal(effective.configured, true);
    const resolved = resolveVisionConfigWithSettings({}, null, env);
    const describeImage = buildDescribeImage(resolved, describe);
    const text = await describeImage(PNG_BYTES);
    assert.equal(text, 'mock 默认描述');
    assert.equal(server.requests.length, 1);
});
test('Seam 3：完全未配置 → 生效值未就绪，describe 返回引导占位符、不请求视觉端点', async (t) => {
    const server = await createMockServer();
    t.after(() => server.close());
    const settings = fakeSettings({});
    const handler = makePeriscopeRpcHandler(settings, 'periscope', {});
    const effResult = await handler('describeEffective', null);
    assert.equal(effResult.ok, true);
    if (!effResult.ok)
        return;
    const effective = effResult.value;
    assert.equal(effective.configured, false, '完全未配置 → 未就绪');
    const resolved = resolveVisionConfigWithSettings({}, null, {});
    const describeImage = buildDescribeImage(resolved, describe);
    const text = await describeImage(PNG_BYTES);
    assert.match(text, /视觉端点未配置/, '未配置时 describe 应返回可操作引导占位符');
    assert.equal(server.requests.length, 0, '未配置时绝不请求视觉端点');
});
