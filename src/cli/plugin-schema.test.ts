import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import { makeTempDir, PLUGIN_SCHEMA_1_0_0 } from '../testing/fixtures';
import {
  FetchLike,
  isSchemaCacheFresh,
  loadPluginSchema,
  PLUGIN_SCHEMA_URL,
  pluginSchemaCachePath,
  validatePluginManifest,
} from './plugin-schema';

/**
 * 手写 schema 解释器 + 缓存/TTL 的单元测试（issue #13）。
 * 全部使用固定本地 schema fixture + 注入 fetchFn，不依赖真实 schema URL（避免 CI 抖动）。
 */

/** 合规模板：与真实根 plugin.json（#10 产出）同形。 */
const VALID_MANIFEST: Record<string, unknown> = {
  $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
  name: 'periscope',
  version: '0.1.0',
  description: '给纯文本 coding agent 的视觉桥插件',
  author: { name: 'toRolex' },
};

function seedCacheFile(dir: string, schema: Record<string, unknown>): string {
  fs.mkdirSync(dir, { recursive: true });
  const cachePath = pluginSchemaCachePath(dir);
  fs.writeFileSync(cachePath, JSON.stringify(schema, null, 2));
  return cachePath;
}

// ---- validatePluginManifest：合规 / 不合规 + 来源提示 ----

test('validatePluginManifest 合规模板 → 无错误', () => {
  assert.deepStrictEqual(validatePluginManifest(VALID_MANIFEST, PLUGIN_SCHEMA_1_0_0), []);
});

test('validatePluginManifest name 大写 → 报 $.name 不符合 pattern', () => {
  const errors = validatePluginManifest(
    { ...VALID_MANIFEST, name: 'Periscope' },
    PLUGIN_SCHEMA_1_0_0,
  );
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes('$.name')), `应提示 $.name 来源：\n${errors.join('\n')}`);
});

test('validatePluginManifest 缺少必填 $schema → 报缺少必填字段', () => {
  const broken = { ...VALID_MANIFEST };
  delete broken.$schema;
  const errors = validatePluginManifest(broken, PLUGIN_SCHEMA_1_0_0);
  assert.ok(
    errors.some((e) => e.includes('$schema') && e.includes('缺少必填字段')),
    `应提示 $. 缺少必填字段 $schema：\n${errors.join('\n')}`,
  );
});

test('validatePluginManifest 多余顶层字段 → 报不允许的字段', () => {
  const errors = validatePluginManifest(
    { ...VALID_MANIFEST, foo: 1 },
    PLUGIN_SCHEMA_1_0_0,
  );
  assert.ok(
    errors.some((e) => e.includes('$.foo') && e.includes('不允许的字段')),
    `应提示 $.foo 不允许：\n${errors.join('\n')}`,
  );
});

test('validatePluginManifest author 多余字段 → 报 $.author 不允许', () => {
  const errors = validatePluginManifest(
    { ...VALID_MANIFEST, author: { name: 'toRolex', phone: 'x' } },
    PLUGIN_SCHEMA_1_0_0,
  );
  assert.ok(
    errors.some((e) => e.includes('$.author') && e.includes('不允许的字段')),
    `应提示 $.author 不允许的字段：\n${errors.join('\n')}`,
  );
});

test('validatePluginManifest version 为数字 → 报 $.version 类型错误', () => {
  const errors = validatePluginManifest(
    { ...VALID_MANIFEST, version: 1 },
    PLUGIN_SCHEMA_1_0_0,
  );
  assert.ok(
    errors.some((e) => e.includes('$.version') && e.includes('类型应为 string')),
    `应提示 $.version 类型错误：\n${errors.join('\n')}`,
  );
});

test('validatePluginManifest name 空字符串 → 报 minLength', () => {
  const errors = validatePluginManifest(
    { ...VALID_MANIFEST, name: '' },
    PLUGIN_SCHEMA_1_0_0,
  );
  assert.ok(
    errors.some((e) => e.includes('$.name') && e.includes('minLength')),
    `应提示 $.name minLength：\n${errors.join('\n')}`,
  );
});

test('validatePluginManifest 非对象 manifest → 报 $ 类型错误', () => {
  const errors = validatePluginManifest('periscope', PLUGIN_SCHEMA_1_0_0);
  assert.ok(
    errors.some((e) => e.includes('类型应为 object')),
    `应提示根类型错误：\n${errors.join('\n')}`,
  );
});

test('validatePluginManifest schema 非对象 → 报 schema 格式错误', () => {
  const errors = validatePluginManifest(VALID_MANIFEST, 'not-a-schema');
  assert.ok(
    errors.some((e) => e.includes('schema 格式错误')),
    `应提示 schema 格式错误：\n${errors.join('\n')}`,
  );
});

// ---- 缓存 TTL：7 天过期判定 ----

test('isSchemaCacheFresh：缺失 false / 新鲜 true / 过期 false', () => {
  const dir = makeTempDir('periscope-schema-fresh-');
  const cachePath = pluginSchemaCachePath(dir);
  assert.equal(isSchemaCacheFresh(cachePath), false, '缓存缺失应为 false');

  seedCacheFile(dir, PLUGIN_SCHEMA_1_0_0);
  assert.equal(isSchemaCacheFresh(cachePath), true, '刚写入的缓存应新鲜');

  const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 天前
  fs.utimesSync(cachePath, past, past);
  assert.equal(isSchemaCacheFresh(cachePath), false, 'mtime 超过 7 天应过期');
});

// ---- loadPluginSchema：缓存命中 / 拉取 / 失败 ----

test('loadPluginSchema 缓存命中 → source=cache，fetchFn 不被调用', async () => {
  const dir = makeTempDir('periscope-schema-hit-');
  seedCacheFile(dir, PLUGIN_SCHEMA_1_0_0);

  let calls = 0;
  const fetchFn: FetchLike = async () => {
    calls += 1;
    throw new Error('缓存命中时不应发起网络请求');
  };

  const loaded = await loadPluginSchema(dir, fetchFn);
  assert.equal(loaded.source, 'cache');
  assert.equal(calls, 0);
  assert.deepStrictEqual(loaded.schema, PLUGIN_SCHEMA_1_0_0);
});

test('loadPluginSchema 缓存缺失 → 拉取远程 + 写回缓存 + source=remote', async () => {
  const dir = makeTempDir('periscope-schema-miss-');
  const urls: string[] = [];
  const fetchFn: FetchLike = async (url) => {
    urls.push(url);
    return { ok: true, status: 200, json: async () => PLUGIN_SCHEMA_1_0_0 };
  };

  const loaded = await loadPluginSchema(dir, fetchFn);
  assert.equal(loaded.source, 'remote');
  assert.deepStrictEqual(urls, [PLUGIN_SCHEMA_URL]);
  assert.deepStrictEqual(loaded.schema, PLUGIN_SCHEMA_1_0_0);

  const written = JSON.parse(
    fs.readFileSync(pluginSchemaCachePath(dir)).toString('utf8'),
  ) as Record<string, unknown>;
  assert.deepStrictEqual(written, PLUGIN_SCHEMA_1_0_0);
});

test('loadPluginSchema 缓存过期 → 重新拉取并更新缓存', async () => {
  const dir = makeTempDir('periscope-schema-stale-');
  const cachePath = seedCacheFile(dir, { stale: true });
  const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  fs.utimesSync(cachePath, past, past);

  let calls = 0;
  const fetchFn: FetchLike = async () => {
    calls += 1;
    return { ok: true, status: 200, json: async () => PLUGIN_SCHEMA_1_0_0 };
  };

  const loaded = await loadPluginSchema(dir, fetchFn);
  assert.equal(loaded.source, 'remote');
  assert.equal(calls, 1);
  assert.deepStrictEqual(loaded.schema, PLUGIN_SCHEMA_1_0_0);

  const written = JSON.parse(fs.readFileSync(cachePath).toString('utf8')) as Record<
    string,
    unknown
  >;
  assert.deepStrictEqual(written, PLUGIN_SCHEMA_1_0_0);
});

test('loadPluginSchema 拉取抛错 → reject（调用方降级 ⚠️）', async () => {
  const dir = makeTempDir('periscope-schema-fail-');
  const fetchFn: FetchLike = async () => {
    throw new Error('offline');
  };
  await assert.rejects(loadPluginSchema(dir, fetchFn));
});

test('loadPluginSchema 拉取返回非 2xx → reject（调用方降级 ⚠️）', async () => {
  const dir = makeTempDir('periscope-schema-status-');
  const fetchFn: FetchLike = async () => ({
    ok: false,
    status: 500,
    json: async () => ({}),
  });
  await assert.rejects(loadPluginSchema(dir, fetchFn));
});

test('loadPluginSchema 拉取返回非法 JSON → reject（调用方降级 ⚠️）', async () => {
  const dir = makeTempDir('periscope-schema-badjson-');
  const fetchFn: FetchLike = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error('invalid json');
    },
  });
  await assert.rejects(loadPluginSchema(dir, fetchFn));
});
