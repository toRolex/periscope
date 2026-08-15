import { test } from 'node:test';
import * as assert from 'node:assert';
import * as React from 'react';
import TestRenderer from 'react-test-renderer';

/**
 * Seam 2 —— browser half 配置卡片（issue #34）的 React 组件测试。
 *
 * 被测对象是 `client/client.js`（手写 CJS factory bundle，与 tsdown clientBundle() 产物同构）。
 * 它在浏览器经 client-modules 装载：顶部调 `window.__ModuleLoader__.load({id, factory})`，
 * factory 在物化时收到同步 require，`require('react')` 解析到平台 seed 模块。
 * 本测试用 `globalThis.window` shim 捕获 handoff，注入真 React，再以假 `ctx.slots` /
 * `ctx.connection.rpc` 驱动 apply + 渲染，黑盒断言卡片行为：
 *   渲染字段 / 挂载经 rpc.call describe 读当前存储值 / 保存经 rpc.call update 写 settings /
 *   apiKey 字段仅收环境变量名 / staged form（discard 还原）。
 * 全程离线，不触碰 dsh 运行时（browser half 的装载面实测见 spike #32）。
 */

// ── bundle 装载 shim：必须在 import bundle 前装好 window.__ModuleLoader__ ──────────

interface Handoff {
  id: string;
  factory: (requireFn: (spec: string) => unknown) => Record<string, unknown>;
}

let handoff: Handoff | undefined;

(globalThis as { window?: { __ModuleLoader__?: { load(def: Handoff): void } } }).window = {
  __ModuleLoader__: {
    load(def: Handoff): void {
      handoff = def;
    },
  },
};

// src/client → dist/client 两级上溯均为 dsh-plugin 根，相对 URL 在 src 与 dist 下解析一致。
const bundleUrl = new URL('../../client/client.js', import.meta.url).href;

interface BrowserPlugin {
  name: string;
  inject: string[];
  apply(ctx: unknown): void;
}

const plugin: BrowserPlugin = await (async () => {
  await import(bundleUrl);
  if (handoff === undefined) {
    throw new Error('bundle 顶部应调用 window.__ModuleLoader__.load 注册 factory');
  }
  assert.equal(handoff.id, 'periscope-dsh', 'handoff id 必须等于包名 periscope-dsh');
  const loaded = handoff.factory((spec: string): unknown => {
    if (spec === 'react') return React;
    throw new Error(`unexpected require(${spec})`);
  });
  return loaded as unknown as BrowserPlugin;
})();

// ── 测试基台：假 ctx.slots / ctx.connection.rpc ────────────────────────────────────

interface RpcCall {
  channel: string;
  endpoint: string;
  payload: unknown;
}

interface RegisteredCard {
  options: {
    name: string;
    id: string;
    order?: number;
    label?: string | (() => string);
    inject?: () => unknown;
  };
  Component: React.ComponentType;
}

interface Bench {
  calls: RpcCall[];
  registered: RegisteredCard;
}

const EMPTY_READ = {
  ok: true,
  value: {
    value: { protocol: 'openai', baseUrl: '', model: '', apiKeyEnv: '' },
    revision: 0,
  },
};

/** 组装假 ctx 并 apply：捕获注册的卡片组件与全部 rpc.call。 */
function bench(
  describeResult: unknown = EMPTY_READ,
  updateResult: unknown = { ok: true, value: null },
): Bench {
  const calls: RpcCall[] = [];
  let registered: RegisteredCard | undefined;
  const rpc = {
    call: async (channel: string, endpoint: string, payload: unknown): Promise<unknown> => {
      calls.push({ channel, endpoint, payload });
      if (endpoint === 'describe') return describeResult;
      return updateResult;
    },
  };
  const ctx = {
    slots: {
      inject: (key: string, fn: () => unknown): void => {
        assert.equal(key, 'settings.plugin.item', '卡片应注册进 settings.plugin.item 槽位');
        registered = fn() as RegisteredCard;
      },
      register: (options: RegisteredCard['options'], Component: React.ComponentType): RegisteredCard => {
        return { options, Component };
      },
    },
    connection: { rpc },
  };
  plugin.apply(ctx);
  assert.ok(registered, 'apply 应经 slots.inject 注册卡片');
  return { calls, registered: registered as RegisteredCard };
}

/** 挂载卡片并 flush 一次宏任务（让挂载后的 describe → setState 落定）。 */
async function renderCard(registered: RegisteredCard): Promise<TestRenderer.ReactTestRenderer> {
  const props = typeof registered.options.inject === 'function'
    ? (registered.options.inject() as React.Attributes)
    : ({} as React.Attributes);
  let renderer!: TestRenderer.ReactTestRenderer;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(React.createElement(registered.Component, props));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return renderer;
}

/** 取 endpoint 对应的 rpc.call 记录，缺失即断言失败（并满足 TS 窄化）。 */
function requireCall(calls: RpcCall[], endpoint: string): RpcCall {
  const call = calls.find((c) => c.endpoint === endpoint);
  if (call === undefined) {
    throw new Error(`应发起 ${endpoint} 调用，实际 calls=${JSON.stringify(calls)}`);
  }
  return call;
}

// ── 用例 ───────────────────────────────────────────────────────────────────────────

test('apply 声明 slots+connection 注入，注册 settings.plugin.item 卡片', () => {
  const { registered } = bench();
  assert.equal(plugin.name, 'periscope-dsh');
  assert.deepEqual(plugin.inject, ['slots', 'connection']);
  assert.equal(registered.options.name, 'settings.plugin.item');
  assert.equal(registered.options.id, 'periscope-vision');
  assert.equal(registered.options.order, 100);
  assert.equal(typeof registered.options.label, 'string');
});

test('卡片渲染 protocol 下拉（三值）+ baseUrl / model / apiKeyEnv 字段 + save/discard', async () => {
  const { registered } = bench();
  const renderer = await renderCard(registered);

  const select = renderer.root.findByProps({ 'data-field': 'protocol' });
  assert.equal(select.type, 'select');
  const options = (select.children as unknown as React.ReactElement[]).map(
    (option) => (option.props as { value: string; children: string }).value,
  );
  assert.deepEqual(options, ['openai', 'anthropic', 'responses']);

  for (const field of ['baseUrl', 'model', 'apiKeyEnv']) {
    const input = renderer.root.findByProps({ 'data-field': field });
    assert.equal(input.type, 'input', `${field} 字段应为 input`);
  }

  assert.equal(renderer.root.findByProps({ 'data-action': 'save' }).type, 'button');
  assert.equal(renderer.root.findByProps({ 'data-action': 'discard' }).type, 'button');
});

test('挂载时经 connection.rpc.call(/periscope, describe) 读当前存储值并回填字段', async () => {
  const read = {
    ok: true,
    value: {
      value: {
        protocol: 'anthropic',
        baseUrl: 'https://base.example.com/v1',
        model: 'vision-model',
        apiKeyEnv: 'PERISCOPE_VISION_KEY',
      },
      revision: 0,
    },
  };
  const { calls, registered } = bench(read);
  const renderer = await renderCard(registered);

  const describeCall = calls.find((c) => c.endpoint === 'describe');
  assert.deepEqual(describeCall, { channel: '/periscope', endpoint: 'describe', payload: null });
  assert.equal(renderer.root.findByProps({ 'data-field': 'protocol' }).props.value, 'anthropic');
  assert.equal(renderer.root.findByProps({ 'data-field': 'baseUrl' }).props.value, 'https://base.example.com/v1');
  assert.equal(renderer.root.findByProps({ 'data-field': 'model' }).props.value, 'vision-model');
  assert.equal(renderer.root.findByProps({ 'data-field': 'apiKeyEnv' }).props.value, 'PERISCOPE_VISION_KEY');
});

test('保存经 connection.rpc.call(/periscope, update, {patch}) 写 settings（四字段齐全）', async () => {
  const { calls, registered } = bench();
  const renderer = await renderCard(registered);

  const base = renderer.root.findByProps({ 'data-field': 'baseUrl' });
  await TestRenderer.act(async () => {
    base.props.onChange({ target: { value: 'https://new.example.com/v1' } });
  });
  const model = renderer.root.findByProps({ 'data-field': 'model' });
  await TestRenderer.act(async () => {
    model.props.onChange({ target: { value: 'new-vision-model' } });
  });
  const apiKeyEnv = renderer.root.findByProps({ 'data-field': 'apiKeyEnv' });
  await TestRenderer.act(async () => {
    apiKeyEnv.props.onChange({ target: { value: 'PERISCOPE_NEW_KEY' } });
  });

  const save = renderer.root.findByProps({ 'data-action': 'save' });
  await TestRenderer.act(async () => {
    save.props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const updateCall = requireCall(calls, 'update');
  assert.equal(updateCall.channel, '/periscope');
  assert.deepEqual(updateCall.payload, {
    patch: { protocol: 'openai', baseUrl: 'https://new.example.com/v1', model: 'new-vision-model', apiKeyEnv: 'PERISCOPE_NEW_KEY' },
  });
});

test('apiKey 字段仅收环境变量名：非法值（含字面 key 特征）显示错误并阻断保存', async () => {
  const { calls, registered } = bench();
  const renderer = await renderCard(registered);

  const apiKeyEnv = renderer.root.findByProps({ 'data-field': 'apiKeyEnv' });
  await TestRenderer.act(async () => {
    apiKeyEnv.props.onChange({ target: { value: 'sk-proj-abcdef' } });
  });

  const error = renderer.root.findByProps({ 'data-error': 'apiKeyEnv' });
  assert.ok(error, '非法值应渲染错误提示');
  assert.match(String(error.props.children), /环境变量/);

  const save = renderer.root.findByProps({ 'data-action': 'save' });
  await TestRenderer.act(async () => {
    save.props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(calls.filter((c) => c.endpoint === 'update').length, 0, '非法 apiKeyEnv 不应发起 update');
});

test('apiKey 字段仅收环境变量名：合法环境变量名可保存，patch.apiKeyEnv 为环境变量名', async () => {
  const { calls, registered } = bench();
  const renderer = await renderCard(registered);

  const apiKeyEnv = renderer.root.findByProps({ 'data-field': 'apiKeyEnv' });
  await TestRenderer.act(async () => {
    apiKeyEnv.props.onChange({ target: { value: 'PERISCOPE_VISION_KEY' } });
  });

  const save = renderer.root.findByProps({ 'data-action': 'save' });
  await TestRenderer.act(async () => {
    save.props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const updateCall = requireCall(calls, 'update');
  assert.deepEqual((updateCall.payload as { patch: { apiKeyEnv: string } }).patch.apiKeyEnv, 'PERISCOPE_VISION_KEY');
});

test('apiKey 字段留空允许保存（本地无鉴权端点），patch.apiKeyEnv 为空串', async () => {
  const { calls, registered } = bench();
  const renderer = await renderCard(registered);

  const save = renderer.root.findByProps({ 'data-action': 'save' });
  await TestRenderer.act(async () => {
    save.props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const updateCall = requireCall(calls, 'update');
  assert.equal((updateCall.payload as { patch: { apiKeyEnv: string } }).patch.apiKeyEnv, '');
});

test('apiKey 非法时点保存不重复展示全局消息（内联错误已提示），且不发起 update', async () => {
  const { calls, registered } = bench();
  const renderer = await renderCard(registered);

  const apiKeyEnv = renderer.root.findByProps({ 'data-field': 'apiKeyEnv' });
  await TestRenderer.act(async () => {
    apiKeyEnv.props.onChange({ target: { value: 'sk-abc-123' } });
  });
  const save = renderer.root.findByProps({ 'data-action': 'save' });
  await TestRenderer.act(async () => {
    save.props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.ok(renderer.root.findByProps({ 'data-error': 'apiKeyEnv' }), '内联错误应保留');
  assert.throws(
    () => renderer.root.findByProps({ 'data-status': 'error' }),
    undefined,
    '非法 apiKeyEnv 不应再写全局消息（避免与内联错误重复）',
  );
  assert.equal(calls.filter((c) => c.endpoint === 'update').length, 0, '非法 apiKeyEnv 不应发起 update');
});

test('保存失败且响应为 null 时显示默认文案（不出现 "undefined"）', async () => {
  const { calls, registered } = bench(EMPTY_READ, null);
  const renderer = await renderCard(registered);

  const base = renderer.root.findByProps({ 'data-field': 'baseUrl' });
  await TestRenderer.act(async () => {
    base.props.onChange({ target: { value: 'https://x.example.com/v1' } });
  });
  const save = renderer.root.findByProps({ 'data-action': 'save' });
  await TestRenderer.act(async () => {
    save.props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.ok(calls.find((c) => c.endpoint === 'update'), '应发起 update');
  const status = renderer.root.findByProps({ 'data-status': 'error' });
  assert.match(String(status.props.children), /未知错误/);
  assert.doesNotMatch(String(status.props.children), /undefined/);
});

test('字段变更清空全局消息（staged 编辑后旧消息不残留）', async () => {
  const { registered } = bench(EMPTY_READ, null);
  const renderer = await renderCard(registered);

  const base = renderer.root.findByProps({ 'data-field': 'baseUrl' });
  await TestRenderer.act(async () => {
    base.props.onChange({ target: { value: 'https://x.example.com/v1' } });
  });
  const save = renderer.root.findByProps({ 'data-action': 'save' });
  await TestRenderer.act(async () => {
    save.props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.ok(renderer.root.findByProps({ 'data-status': 'error' }), '保存失败应显示全局消息');

  await TestRenderer.act(async () => {
    base.props.onChange({ target: { value: 'https://y.example.com/v1' } });
  });
  assert.throws(
    () => renderer.root.findByProps({ 'data-status': 'error' }),
    undefined,
    '字段变更后应清空全局消息',
  );
});

test('discard 还原 staged 编辑为已加载值', async () => {
  const read = {
    ok: true,
    value: {
      value: { protocol: 'openai', baseUrl: 'https://orig.example.com/v1', model: 'orig-model', apiKeyEnv: '' },
      revision: 0,
    },
  };
  const { registered } = bench(read);
  const renderer = await renderCard(registered);

  const base = renderer.root.findByProps({ 'data-field': 'baseUrl' });
  await TestRenderer.act(async () => {
    base.props.onChange({ target: { value: 'https://edited.example.com/v1' } });
  });
  assert.equal(renderer.root.findByProps({ 'data-field': 'baseUrl' }).props.value, 'https://edited.example.com/v1');

  const discard = renderer.root.findByProps({ 'data-action': 'discard' });
  await TestRenderer.act(async () => {
    discard.props.onClick();
  });
  assert.equal(renderer.root.findByProps({ 'data-field': 'baseUrl' }).props.value, 'https://orig.example.com/v1');
});

test('protocol 下拉三值可切换，保存时 patch.protocol 为切换后的值', async () => {
  const { calls, registered } = bench();
  const renderer = await renderCard(registered);

  const select = renderer.root.findByProps({ 'data-field': 'protocol' });
  await TestRenderer.act(async () => {
    select.props.onChange({ target: { value: 'responses' } });
  });
  assert.equal(renderer.root.findByProps({ 'data-field': 'protocol' }).props.value, 'responses');

  const save = renderer.root.findByProps({ 'data-action': 'save' });
  await TestRenderer.act(async () => {
    save.props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const updateCall = requireCall(calls, 'update');
  assert.equal((updateCall.payload as { patch: { protocol: string } }).patch.protocol, 'responses');
});

test('settings 命名空间不可用（describe 返回 registered:false）时卡片仍渲染默认表单，不抛错', async () => {
  const { calls, registered } = bench({ ok: true, value: { registered: false } });
  const renderer = await renderCard(registered);

  const describeCall = calls.find((c) => c.endpoint === 'describe');
  assert.deepEqual(describeCall, { channel: '/periscope', endpoint: 'describe', payload: null });
  // 默认表单：openai + 三空字段（settings 服务可选，缺省回落 cordis.yml / env）
  assert.equal(renderer.root.findByProps({ 'data-field': 'protocol' }).props.value, 'openai');
  for (const field of ['baseUrl', 'model', 'apiKeyEnv']) {
    assert.equal(renderer.root.findByProps({ 'data-field': field }).props.value, '');
  }
});

test('保存成功后把当前 draft 记为已加载值（后续 discard 回到最近保存）', async () => {
  const { calls, registered } = bench();
  const renderer = await renderCard(registered);

  const base = renderer.root.findByProps({ 'data-field': 'baseUrl' });
  await TestRenderer.act(async () => {
    base.props.onChange({ target: { value: 'https://saved.example.com/v1' } });
  });
  const save = renderer.root.findByProps({ 'data-action': 'save' });
  await TestRenderer.act(async () => {
    save.props.onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.ok(calls.find((c) => c.endpoint === 'update'), '保存应发起 update');

  const base2 = renderer.root.findByProps({ 'data-field': 'baseUrl' });
  await TestRenderer.act(async () => {
    base2.props.onChange({ target: { value: 'https://unsaved.example.com/v1' } });
  });
  const discard = renderer.root.findByProps({ 'data-action': 'discard' });
  await TestRenderer.act(async () => {
    discard.props.onClick();
  });
  assert.equal(renderer.root.findByProps({ 'data-field': 'baseUrl' }).props.value, 'https://saved.example.com/v1');
});
