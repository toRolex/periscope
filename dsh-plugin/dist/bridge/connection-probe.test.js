import { test } from 'node:test';
import * as assert from 'node:assert';
import { makeConnectionProbe } from './connection-probe.js';
import { createMockServer } from '../testing/mock-server.js';
/**
 * 连接探测纯逻辑（issue #36，Seam 3 端到端切片一：server 侧探测）。
 *
 * 被测对象是 makeConnectionProbe 产出的 ping 函数：用「当前生效配置」构造对端点的探测
 * 请求（复用协议适配器的 buildRequest，URL/鉴权头/请求形状与真实 describe 完全一致），
 * 网络请求走可注入 transport（mock-server 提供可达/不可达两种 fixture），全程离线。
 * 结果折叠为 ConnectionProbeResult：可达 / 不可达（未配置 / 网络层 / HTTP 层），
 * 不可达必带指向 baseUrl / apiKeyEnv / 网络的可操作提示。
 */
/** 测试用 ResolvedVisionConfig 基座（mock 端点 / 空配置由用例覆盖）。 */
function vision(overrides = {}) {
    return {
        protocol: 'openai',
        baseUrl: 'https://example.com',
        model: 'vision-model',
        apiKeyEnv: 'PERISCOPE_API_KEY',
        apiKey: '',
        ...overrides,
    };
}
test('可达端点（HTTP 200）：探测返回可达，请求经协议适配器构造（openai /chat/completions + 鉴权头）', async (t) => {
    const server = await createMockServer({
        defaultBody: JSON.stringify({ choices: [{ message: { content: 'ping' } }] }),
    });
    t.after(() => server.close());
    const probe = makeConnectionProbe({
        resolve: () => vision({ baseUrl: server.baseUrl, apiKey: 'sk-x' }),
    });
    const result = await probe();
    assert.equal(result.ok, true, 'HTTP 200 应判定为可达');
    assert.match(result.message, /HTTP 200/);
    assert.equal(server.requests.length, 1);
    const req = server.requests[0];
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/chat/completions');
    assert.equal(req.headers['authorization'], 'Bearer sk-x');
});
test('端点返回非 2xx（401）：不可达，给出指向 baseUrl/apiKeyEnv 的可操作提示', async (t) => {
    const server = await createMockServer({
        defaultStatus: 401,
        defaultBody: '{"error":"unauthorized"}',
    });
    t.after(() => server.close());
    const probe = makeConnectionProbe({ resolve: () => vision({ baseUrl: server.baseUrl }) });
    const result = await probe();
    assert.equal(result.ok, false);
    assert.match(result.message, /HTTP 401/);
    assert.ok(result.hint !== undefined, '不可达应带可操作提示');
    assert.match(result.hint ?? '', /baseUrl|apiKeyEnv|apiKey/);
});
test('网络层失败（transport 抛错）：不可达，提示检查网络/baseUrl', async () => {
    const transport = {
        async post() {
            throw new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:9');
        },
    };
    const probe = makeConnectionProbe({ resolve: () => vision(), transport });
    const result = await probe();
    assert.equal(result.ok, false);
    assert.match(result.message, /网络请求失败/);
    assert.match(result.message, /ECONNREFUSED/);
    assert.ok(result.hint !== undefined);
    assert.match(result.hint ?? '', /baseUrl|网络/);
});
test('未配置 baseUrl/model：不可达，提示先填写配置，且不发起任何请求', async () => {
    let calls = 0;
    const transport = {
        async post() {
            calls += 1;
            return { status: 200, ok: true, text: '{}' };
        },
    };
    const probe = makeConnectionProbe({
        resolve: () => vision({ baseUrl: '', model: '' }),
        transport,
    });
    const result = await probe();
    assert.equal(result.ok, false);
    assert.match(result.message, /未配置/);
    assert.ok(result.hint !== undefined);
    assert.match(result.hint ?? '', /填写|保存/);
    assert.equal(calls, 0, '未配置时不应发起请求');
});
test('anthropic 协议：探测请求走 /v1/messages 且带 x-api-key', async (t) => {
    const server = await createMockServer({
        defaultBody: JSON.stringify({ content: [{ type: 'text', text: 'ping' }] }),
    });
    t.after(() => server.close());
    const probe = makeConnectionProbe({
        resolve: () => vision({ protocol: 'anthropic', baseUrl: server.baseUrl, apiKey: 'sk-ant' }),
    });
    const result = await probe();
    assert.equal(result.ok, true);
    const req = server.requests[0];
    assert.equal(req.url, '/v1/messages');
    assert.equal(req.headers['x-api-key'], 'sk-ant');
});
test('responses 协议：探测请求走 /responses 且带鉴权头', async (t) => {
    const server = await createMockServer({
        defaultBody: JSON.stringify({
            output: [
                {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'ping' }],
                },
            ],
        }),
    });
    t.after(() => server.close());
    const probe = makeConnectionProbe({
        resolve: () => vision({ protocol: 'responses', baseUrl: server.baseUrl, apiKey: 'sk-r' }),
    });
    const result = await probe();
    assert.equal(result.ok, true);
    const req = server.requests[0];
    assert.equal(req.url, '/responses');
    assert.equal(req.headers['authorization'], 'Bearer sk-r');
});
