import { test } from 'node:test';
import * as assert from 'node:assert';
import {
  PeriscopeSettingsPort,
  makePeriscopeRpcHandler,
} from './settings-rpc.js';

/**
 * /periscope connection RPC channel（读当前存储值 / 合并写 user 层）的纯逻辑测试（#33）。
 * 全程离线：settings 服务以最小 port 注入，不触碰 dsh 运行时（壳层接线归 plugin.ts 手工 E2E）。
 */

function fakePort(overrides: Partial<PeriscopeSettingsPort> = {}): PeriscopeSettingsPort {
  return {
    read: () => ({ value: {}, revision: 0 }),
    update: async () => {},
    ...overrides,
  };
}

test('describe 端点：返回当前存储值（port.read 透传），读面含 value/user/base/revision', async () => {
  const read = {
    value: { baseUrl: 'https://user.example.com/v1', model: 'user-model' },
    user: { baseUrl: 'https://user.example.com/v1' },
    base: { model: 'yml-model' },
    revision: 3,
  };
  const handler = makePeriscopeRpcHandler(fakePort({ read: () => read }));
  const result = await handler('describe', null);
  assert.deepEqual(result, { ok: true, value: read });
});

test('describe 端点：settings 服务/命名空间不可用 → registered:false（不抛错）', async () => {
  const handler = makePeriscopeRpcHandler(fakePort({ read: () => undefined }));
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
  );
  await handler('update', { patch: { model: 'm' } });
  assert.deepEqual(calls, [{ patch: { model: 'm' }, expectedRevision: undefined }]);
});

test('update 端点：入参畸形（非对象 / 缺 patch）→ bad-request 错误分支，不抛错', async () => {
  const handler = makePeriscopeRpcHandler(fakePort());
  for (const bad of ['not-an-object', null, 42, {}, { patch: 'x' }, { patch: { a: 1 }, expectedRevision: 1.5 }]) {
    const result = await handler('update', bad);
    assert.equal(result.ok, false, `入参 ${JSON.stringify(bad)} 应拒绝`);
    if (!result.ok) assert.equal(result.error.code, 'bad-request');
  }
});

test('update 端点：port.update 抛错（如 settings 拒绝）→ settings-rejected 错误分支，不抛错', async () => {
  const handler = makePeriscopeRpcHandler(
    fakePort({
      update: async () => {
        throw new Error('settings namespace is not registered');
      },
    }),
  );
  const result = await handler('update', { patch: { baseUrl: 'https://x' } });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'settings-rejected');
    assert.match(result.error.message, /not registered/);
  }
});

test('未知端点 → bad-request 错误分支', async () => {
  const handler = makePeriscopeRpcHandler(fakePort());
  const result = await handler('nope', null);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'bad-request');
});

test('handler 接受 dsh 真实三参（endpoint/payload/signal）：signal 被忽略、不抛错', async () => {
  const handler = makePeriscopeRpcHandler(fakePort());
  const result = await handler('describe', null, new AbortController().signal);
  assert.equal(result.ok, true);
});

test('update 端点：patch 含未知键 → bad-request（白名单 protocol/baseUrl/model/apiKeyEnv）', async () => {
  const handler = makePeriscopeRpcHandler(fakePort());
  for (const badPatch of [
    { model: 'm', typo: 'x' },
    { apiKey: 'sk-x' },
    { baseUrl: 'https://x', foo: 1 },
  ]) {
    const result = await handler('update', { patch: badPatch });
    assert.equal(result.ok, false, `patch ${JSON.stringify(badPatch)} 应拒绝`);
    if (!result.ok) assert.equal(result.error.code, 'bad-request');
  }
});

test('update 端点：patch 全为合法键（四字段任意子集）→ 通过并原样交给 port.update', async () => {
  const calls: { patch: Record<string, unknown>; expectedRevision: number | undefined }[] = [];
  const handler = makePeriscopeRpcHandler(
    fakePort({
      update: async (patch, expectedRevision) => {
        calls.push({ patch, expectedRevision });
      },
    }),
  );
  const patch = { protocol: 'anthropic', baseUrl: 'https://x', model: 'm', apiKeyEnv: 'K' };
  const result = await handler('update', { patch });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ patch, expectedRevision: undefined }]);
});
