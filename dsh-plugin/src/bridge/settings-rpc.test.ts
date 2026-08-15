import { test } from 'node:test';
import * as assert from 'node:assert';
import {
  PeriscopeRpcError,
  PeriscopeRpcResult,
  PeriscopeSettingsPort,
  effectiveFromRead,
  makePeriscopeRpcHandler,
} from './settings-rpc.js';
import { VISION_ENV } from './vision-config.js';
import type { VisionConfigEnv } from './vision-config.js';

/**
 * /periscope connection RPC channel（读当前存储值 / 合并写 user 层）的纯逻辑测试（#33）。
 * 全程离线：settings 服务以最小 port 注入，不触碰 dsh 运行时（壳层接线归 plugin.ts 手工 E2E）。
 * #34 起 handler 需命名空间名（写进 settings-rejected 的 details.ns），并新增错误分支产出
 * dsh wire schema 兼容 details 的断言（review-34 反馈：details 形状不符会令浏览器侧 ZodError 拒绝）。
 * #35 新增 describeEffective 端点：暴露 settings > cordis.yml > env 归并后的生效配置值
 * （含每字段来源标记与就绪判定），供配置卡片回显；env 以注入面传入，不依赖 process.env。
 */

/** 与 plugin.ts NS（settingsNamespace('periscope')）同值的测试常量。 */
const NS = 'periscope';

function fakePort(overrides: Partial<PeriscopeSettingsPort> = {}): PeriscopeSettingsPort {
  return {
    read: () => ({ value: {}, revision: 0 }),
    update: async () => {},
    ...overrides,
  };
}

/**
 * dsh wire schema（rpcErrorSchema）的最小复刻：校验本 handler 可产出的两种错误 code 的
 * details 形状——bad-request → { issues: [] }、settings-rejected → { ns: string }。
 * 与 @deepseek-ai/dsh-host-apiproxy/api 的 rpcErrorSchema 判别联合同构（未引入重依赖）。
 */
function assertWireCompatibleError(error: PeriscopeRpcError): void {
  if (error.code === 'bad-request') {
    assert.ok(Array.isArray(error.details.issues), 'bad-request.details.issues 必须是数组');
  } else if (error.code === 'settings-rejected') {
    assert.equal(typeof error.details.ns, 'string', 'settings-rejected.details.ns 必须是字符串');
  } else {
    throw new Error(`未覆盖的 error code：${(error as { code: string }).code}`);
  }
}

test('describe 端点：返回当前存储值（port.read 透传），读面含 value/user/base/revision', async () => {
  const read = {
    value: { baseUrl: 'https://user.example.com/v1', model: 'user-model' },
    user: { baseUrl: 'https://user.example.com/v1' },
    base: { model: 'yml-model' },
    revision: 3,
  };
  const handler = makePeriscopeRpcHandler(fakePort({ read: () => read }), NS);
  const result = await handler('describe', null);
  assert.deepEqual(result, { ok: true, value: read });
});

test('describe 端点：settings 服务/命名空间不可用 → registered:false（不抛错）', async () => {
  const handler = makePeriscopeRpcHandler(fakePort({ read: () => undefined }), NS);
  const result = await handler('describe', null);
  assert.deepEqual(result, { ok: true, value: { registered: false } });
});

test('update 端点：合并写 user 层（patch + expectedRevision 原样交给 port.update）', async () => {
  const calls: { patch: Record<string, unknown>; expectedRevision: number | undefined }[] = [];
  const handler = makePeriscopeRpcHandler(
    fakePort({
      update: async (patch, expectedRevision) => {
        calls.push({ patch, expectedRevision });
      },
    }),
    NS,
  );
  const result = await handler('update', { patch: { baseUrl: 'https://new.example.com/v1' }, expectedRevision: 2 });
  assert.deepEqual(result, { ok: true, value: null });
  assert.deepEqual(calls, [{ patch: { baseUrl: 'https://new.example.com/v1' }, expectedRevision: 2 }]);
});

test('update 端点：expectedRevision 可缺省（不启用乐观并发）', async () => {
  const calls: unknown[] = [];
  const handler = makePeriscopeRpcHandler(
    fakePort({
      update: async (patch, expectedRevision) => {
        calls.push({ patch, expectedRevision });
      },
    }),
    NS,
  );
  await handler('update', { patch: { model: 'm' } });
  assert.deepEqual(calls, [{ patch: { model: 'm' }, expectedRevision: undefined }]);
});

test('update 端点：入参畸形（非对象 / 缺 patch）→ bad-request 错误分支，不抛错', async () => {
  const handler = makePeriscopeRpcHandler(fakePort(), NS);
  for (const bad of ['not-an-object', null, 42, {}, { patch: 'x' }, { patch: { a: 1 }, expectedRevision: 1.5 }]) {
    const result = await handler('update', bad);
    assert.equal(result.ok, false, `入参 ${JSON.stringify(bad)} 应拒绝`);
    if (!result.ok) {
      assert.equal(result.error.code, 'bad-request');
      assert.deepEqual(result.error.details, { issues: [] }, 'bad-request details 应对齐 wire schema');
    }
  }
});

test('update 端点：port.update 抛错（如 settings 拒绝）→ settings-rejected 错误分支，不抛错', async () => {
  const handler = makePeriscopeRpcHandler(
    fakePort({
      update: async () => {
        throw new Error('settings namespace is not registered');
      },
    }),
    NS,
  );
  const result = await handler('update', { patch: { baseUrl: 'https://x' } });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'settings-rejected');
    assert.match(result.error.message, /not registered/);
    assert.deepEqual(result.error.details, { ns: NS }, 'settings-rejected details.ns 应对齐 wire schema');
  }
});

test('未知端点 → bad-request 错误分支', async () => {
  const handler = makePeriscopeRpcHandler(fakePort(), NS);
  const result = await handler('nope', null);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'bad-request');
    assert.deepEqual(result.error.details, { issues: [] });
  }
});

test('handler 接受 dsh 真实三参（endpoint/payload/signal）：signal 被忽略、不抛错', async () => {
  const handler = makePeriscopeRpcHandler(fakePort(), NS);
  const result = await handler('describe', null, new AbortController().signal);
  assert.equal(result.ok, true);
});

test('update 端点：patch 含未知键 → bad-request（白名单 protocol/baseUrl/model/apiKeyEnv）', async () => {
  const handler = makePeriscopeRpcHandler(fakePort(), NS);
  for (const badPatch of [
    { model: 'm', typo: 'x' },
    { apiKey: 'sk-x' },
    { baseUrl: 'https://x', foo: 1 },
  ]) {
    const result = await handler('update', { patch: badPatch });
    assert.equal(result.ok, false, `patch ${JSON.stringify(badPatch)} 应拒绝`);
    if (!result.ok) {
      assert.equal(result.error.code, 'bad-request');
      assert.deepEqual(result.error.details, { issues: [] });
    }
  }
});

test('错误分支产出 dsh wire schema 兼容的 error（bad-request→issues[]，settings-rejected→ns）', async () => {
  const handler = makePeriscopeRpcHandler(
    fakePort({
      update: async () => {
        throw new Error('settings denied');
      },
    }),
    NS,
  );
  const failing: PeriscopeRpcError[] = [];
  const pushError = (result: PeriscopeRpcResult<unknown>): void => {
    assert.equal(result.ok, false);
    if (!result.ok) failing.push(result.error);
  };
  pushError(await handler('update', 'not-an-object'));
  pushError(await handler('update', { patch: { typo: 1 } }));
  pushError(await handler('nope', null));
  pushError(await handler('update', { patch: { baseUrl: 'https://x' } }));
  assert.ok(failing.length >= 4, '应收集到全部错误分支');
  for (const error of failing) {
    assertWireCompatibleError(error);
  }
  // 具体 code 的 details 值也精确对齐
  assert.deepEqual(failing[0], { code: 'bad-request', message: failing[0].message, details: { issues: [] } });
  assert.deepEqual(failing[3], { code: 'settings-rejected', message: failing[3].message, details: { ns: NS } });
});

test('update 端点：patch 全为合法键（四字段任意子集）→ 通过并原样交给 port.update', async () => {
  const calls: { patch: Record<string, unknown>; expectedRevision: number | undefined }[] = [];
  const handler = makePeriscopeRpcHandler(
    fakePort({
      update: async (patch, expectedRevision) => {
        calls.push({ patch, expectedRevision });
      },
    }),
    NS,
  );
  const patch = { protocol: 'anthropic', baseUrl: 'https://x', model: 'm', apiKeyEnv: 'K' };
  const result = await handler('update', { patch });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ patch, expectedRevision: undefined }]);
});

// ── #35 describeEffective（归并生效值回显：settings user > cordis.yml base > env fallback） ──

/** describeEffective 成功值的最小形状（测试内解构用）。 */
interface EffectiveValueShape {
  value: { protocol: string; baseUrl: string; model: string; apiKeyEnv: string };
  sources: Record<string, string>;
  configured: boolean;
}

test('describeEffective：settings/user > cordis/base > env fallback 的归并生效值与来源标记', async () => {
  const read = {
    value: { baseUrl: 'https://settings.example.com/v1', model: 'settings-model' },
    user: { baseUrl: 'https://settings.example.com/v1', model: 'settings-model' },
    base: { baseUrl: 'https://yml.example.com/v1', model: 'yml-model', apiKeyEnv: 'YML_KEY' },
    revision: 1,
  };
  const env: VisionConfigEnv = {
    [VISION_ENV.baseUrl]: 'https://env.example.com/v1',
    [VISION_ENV.model]: 'env-model',
  };
  const handler = makePeriscopeRpcHandler(fakePort({ read: () => read }), NS, env);
  const result = await handler('describeEffective', null);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const value = result.value as EffectiveValueShape;
  assert.equal(value.value.baseUrl, 'https://settings.example.com/v1', 'settings 优先于 cordis/env');
  assert.equal(value.value.model, 'settings-model', 'settings 优先');
  assert.equal(value.value.apiKeyEnv, 'YML_KEY', 'apiKeyEnv 无 env fallback，取 cordis');
  assert.equal(value.sources.baseUrl, 'settings');
  assert.equal(value.sources.model, 'settings');
  assert.equal(value.sources.apiKeyEnv, 'cordis');
  assert.equal(value.configured, true);
});

test('describeEffective：user 层缺省时 cordis/env 生效并标记来源', async () => {
  const read = {
    value: { baseUrl: 'https://yml.example.com/v1' },
    base: { baseUrl: 'https://yml.example.com/v1' },
    revision: 2,
  };
  const env: VisionConfigEnv = {
    [VISION_ENV.protocol]: 'responses',
    [VISION_ENV.model]: 'env-model',
  };
  const handler = makePeriscopeRpcHandler(fakePort({ read: () => read }), NS, env);
  const result = await handler('describeEffective', null);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const value = result.value as EffectiveValueShape;
  assert.equal(value.value.baseUrl, 'https://yml.example.com/v1', 'cordis baseUrl 生效');
  assert.equal(value.value.model, 'env-model', 'cordis 缺 model → env fallback');
  assert.equal(value.value.protocol, 'responses', 'cordis 缺 protocol → env fallback');
  assert.equal(value.sources.baseUrl, 'cordis');
  assert.equal(value.sources.model, 'env');
  assert.equal(value.sources.protocol, 'env');
});

test('describeEffective：全缺省 → 默认值（openai + 空端点 + 默认 apiKeyEnv），configured:false', async () => {
  const read = { value: {}, revision: 0 };
  const handler = makePeriscopeRpcHandler(fakePort({ read: () => read }), NS, {});
  const result = await handler('describeEffective', null);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const value = result.value as EffectiveValueShape;
  assert.equal(value.value.protocol, 'openai');
  assert.equal(value.value.baseUrl, '');
  assert.equal(value.value.model, '');
  assert.equal(value.value.apiKeyEnv, 'PERISCOPE_API_KEY');
  assert.equal(value.sources.protocol, 'default');
  assert.equal(value.sources.baseUrl, 'default');
  assert.equal(value.sources.model, 'default');
  assert.equal(value.sources.apiKeyEnv, 'default');
  assert.equal(value.configured, false);
});

test('describeEffective：settings 服务/命名空间不可用 → registered:false（不抛错）', async () => {
  const handler = makePeriscopeRpcHandler(fakePort({ read: () => undefined }), NS, {});
  const result = await handler('describeEffective', null);
  assert.deepEqual(result, { ok: true, value: { registered: false } });
});

test('describeEffective：port.read 抛错 → settings-rejected 错误分支，不抛错', async () => {
  const handler = makePeriscopeRpcHandler(
    fakePort({
      read: () => {
        throw new Error('settings unavailable');
      },
    }),
    NS,
    {},
  );
  const result = await handler('describeEffective', null);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'settings-rejected');
    assert.deepEqual(result.error.details, { ns: NS }, 'settings-rejected details.ns 应对齐 wire schema');
  }
});

test('describeEffective：settings protocol 非法 → 生效值回落默认 openai，来源仍标 settings（刻意语义：来源标记配置所在层）', async () => {
  const read = {
    value: { protocol: 'not-a-protocol' },
    user: { protocol: 'not-a-protocol' },
    revision: 0,
  };
  const handler = makePeriscopeRpcHandler(fakePort({ read: () => read }), NS, {});
  const result = await handler('describeEffective', null);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const value = result.value as EffectiveValueShape;
  assert.equal(value.value.protocol, 'openai', '非法 protocol 回落到默认');
  assert.equal(value.sources.protocol, 'settings', '来源按配置层标记（非法值所在层）');
});

test('effectiveFromRead：纯函数直接可测（env 注入，多层来源标记）', () => {
  const read = {
    value: { model: 'settings-model' },
    user: { model: 'settings-model' },
    base: { baseUrl: 'https://yml.example.com/v1' },
    revision: 0,
  };
  const eff = effectiveFromRead(read, { [VISION_ENV.model]: 'env-model' });
  const shape = eff as EffectiveValueShape;
  assert.equal(shape.configured, true);
  assert.equal(shape.value.baseUrl, 'https://yml.example.com/v1');
  assert.equal(shape.value.model, 'settings-model');
  assert.equal(shape.sources.baseUrl, 'cordis');
  assert.equal(shape.sources.model, 'settings');
  assert.deepEqual(effectiveFromRead(undefined, {}), { registered: false });
});

test('describeEffective：configured 判定仅依赖 baseUrl/model（protocol 单独配置不算就绪）', async () => {
  const read = {
    value: { protocol: 'anthropic' },
    user: { protocol: 'anthropic' },
    revision: 0,
  };
  const handler = makePeriscopeRpcHandler(fakePort({ read: () => read }), NS, {});
  const result = await handler('describeEffective', null);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const value = result.value as EffectiveValueShape;
  assert.equal(value.value.protocol, 'anthropic');
  assert.equal(value.configured, false, '仅配 protocol、缺 baseUrl/model → 未就绪');
});

// ── #36 ping（连接探测：分发到注入的 probe，网络归 host half） ──

test('ping 端点：分发到注入的 probe.ping，探测结果原样经 value 返回', async () => {
  const probeResult = { ok: true, message: '端点可达（HTTP 200）' };
  const calls: string[] = [];
  const handler = makePeriscopeRpcHandler(fakePort(), NS, {
    probe: {
      ping: async () => {
        calls.push('ping');
        return probeResult;
      },
    },
  });
  const result = await handler('ping', null);
  assert.deepEqual(result, { ok: true, value: probeResult });
  assert.deepEqual(calls, ['ping']);
});

test('ping 端点：不可达结果（ok:false + hint）经 value 原样回传（RPC 层仍是 ok）', async () => {
  const probeResult = {
    ok: false,
    message: '端点返回 HTTP 401',
    hint: '检查 baseUrl 路径是否正确、apiKey 环境变量（apiKeyEnv）是否已设置',
  };
  const handler = makePeriscopeRpcHandler(fakePort(), NS, {
    probe: { ping: async () => probeResult },
  });
  const result = await handler('ping', null);
  assert.equal(result.ok, true, '探测的不可达是正常 RPC 结果，不折叠进 RPC 错误分支');
  if (result.ok) {
    assert.deepEqual(result.value, probeResult);
  }
});

test('ping 端点：未注入 probe → bad-request（探测能力不可用）', async () => {
  const handler = makePeriscopeRpcHandler(fakePort(), NS);
  const result = await handler('ping', null);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'bad-request');
    assert.deepEqual(result.error.details, { issues: [] });
  }
});

test('ping 端点：probe.ping 意外抛错 → 折叠为 settings-rejected 错误分支，不抛错', async () => {
  const handler = makePeriscopeRpcHandler(fakePort(), NS, {
    probe: {
      ping: async () => {
        throw new Error('probe exploded');
      },
    },
  });
  const result = await handler('ping', null);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'settings-rejected');
    assert.match(result.error.message, /probe exploded/);
    assert.deepEqual(result.error.details, { ns: NS });
  }
});
