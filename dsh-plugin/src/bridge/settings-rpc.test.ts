import { test } from 'node:test';
import * as assert from 'node:assert';
import {
  PeriscopeRpcError,
  PeriscopeRpcResult,
  PeriscopeSettingsPort,
  makePeriscopeRpcHandler,
} from './settings-rpc.js';

/**
 * /periscope connection RPC channel（读当前存储值 / 合并写 user 层）的纯逻辑测试（#33）。
 * 全程离线：settings 服务以最小 port 注入，不触碰 dsh 运行时（壳层接线归 plugin.ts 手工 E2E）。
 * #34 起 handler 需命名空间名（写进 settings-rejected 的 details.ns），并新增错误分支产出
 * dsh wire schema 兼容 details 的断言（review-34 反馈：details 形状不符会令浏览器侧 ZodError 拒绝）。
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
