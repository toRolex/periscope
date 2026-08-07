import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Agent Plugins 1.0.0 标准 manifest 断言（issue #10 AC1 / AC2）。
 * 仓库根 = 插件根：编译后的本测试位于 dist/plugin/manifest.test.js，
 * 上溯两级即仓库根。覆盖：
 *   - AC1：仓库根 plugin.json 存在，五字段齐全且 $schema 指向 1.0.0
 *   - AC2：现有 .claude-plugin/ 与 hooks/ 结构未被改动
 *
 * 注意：红线约束下无 @types/node，fs.readFileSync 只声明 (p: string): ByteBuf，
 * 统一用 .toString('utf8') 读文本；assert.ok 不窄化，需显式 null/undefined 检查。
 */

/** 仓库根 = 插件根。 */
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const AGENT_PLUGINS_MANIFEST = path.join(REPO_ROOT, 'plugin.json');
const CLAUDE_PLUGIN_MANIFEST = path.join(REPO_ROOT, '.claude-plugin', 'plugin.json');
const HOOKS_FILE = path.join(REPO_ROOT, 'hooks', 'hooks.json');

function readText(filePath: string): string {
  return fs.readFileSync(filePath).toString('utf8');
}

function readJson(filePath: string): unknown {
  return JSON.parse(readText(filePath));
}

test('AC1 根 plugin.json 存在且为合法 JSON', () => {
  assert.ok(
    fs.existsSync(AGENT_PLUGINS_MANIFEST),
    'Agent Plugins 标准 manifest plugin.json 必须存在于仓库根',
  );
  const raw = readText(AGENT_PLUGINS_MANIFEST);
  let parsed: unknown = undefined;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('plugin.json 必须为合法 JSON');
  }
  assert.ok(parsed !== undefined && typeof parsed === 'object' && parsed !== null, 'plugin.json 应为对象');
});

test('AC1 根 plugin.json 五字段齐全（$schema / name / version / description / author）', () => {
  const manifest = readJson(AGENT_PLUGINS_MANIFEST) as Record<string, unknown>;
  assert.ok('$schema' in manifest, 'plugin.json 应包含 $schema 字段');
  assert.ok('name' in manifest, 'plugin.json 应包含 name 字段');
  assert.ok('version' in manifest, 'plugin.json 应包含 version 字段');
  assert.ok('description' in manifest, 'plugin.json 应包含 description 字段');
  assert.ok('author' in manifest, 'plugin.json 应包含 author 字段');

  assert.equal(typeof manifest['$schema'], 'string', '$schema 应为字符串');
  assert.equal(typeof manifest['name'], 'string', 'name 应为字符串');
  assert.equal(typeof manifest['version'], 'string', 'version 应为字符串');
  assert.equal(typeof manifest['description'], 'string', 'description 应为字符串');
  assert.ok(manifest['author'] !== null && typeof manifest['author'] === 'object', 'author 应为对象');
});

test('AC1 根 plugin.json：name 沿用 periscope', () => {
  const manifest = readJson(AGENT_PLUGINS_MANIFEST) as { name?: string };
  assert.equal(manifest.name, 'periscope', 'name 应沿用 periscope');
});

test('AC1 根 plugin.json：$schema 指向 1.0.0 schema', () => {
  const manifest = readJson(AGENT_PLUGINS_MANIFEST) as Record<string, unknown>;
  const schema: unknown = manifest['$schema'];
  if (typeof schema !== 'string') {
    throw new Error('$schema 应为非空字符串');
  }
  assert.match(
    schema,
    /agent-plugins\.org.*1\.0\.0|1\.0\.0.*agent-plugins/,
    '$schema 应指向 Agent Plugins 1.0.0 schema',
  );
});

test('AC2 现有 .claude-plugin/plugin.json 未被改动', () => {
  assert.ok(
    fs.existsSync(CLAUDE_PLUGIN_MANIFEST),
    '.claude-plugin/plugin.json 必须保留（Claude Code 体验不变）',
  );
  const manifest = readJson(CLAUDE_PLUGIN_MANIFEST) as { name?: string };
  assert.equal(manifest.name, 'periscope', 'Claude Code 插件 name 应仍为 periscope');
});

test('AC2 现有 hooks/hooks.json 未被改动', () => {
  assert.ok(fs.existsSync(HOOKS_FILE), 'hooks/hooks.json 必须保留（Claude Code 体验不变）');
  const hooksFile = readJson(HOOKS_FILE) as {
    hooks?: Record<string, Array<{ hooks?: Array<{ type?: string; args?: string[] }> }>>;
  };
  const hooksObj = hooksFile.hooks;
  if (hooksObj === undefined) {
    throw new Error('应包含顶层 hooks 对象');
  }
  const entries = hooksObj.UserPromptSubmit;
  if (!Array.isArray(entries)) {
    throw new Error('UserPromptSubmit 应为数组');
  }
  const flatHooks = entries.flatMap((e) => e.hooks ?? []);
  assert.ok(flatHooks.length > 0, 'UserPromptSubmit 应至少声明一个 hook（exec form）');
});
