import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** 编译后位于 dist/set-up.test.js，仓库根即 __dirname 的上一级。 */
const REPO_ROOT = path.join(__dirname, '..');
const SETUP_PATH = path.join(REPO_ROOT, 'skills', 'set-up', 'SKILL.md');

function setupMd(): string {
  assert.ok(fs.existsSync(SETUP_PATH), `set-up skill 应存在: ${SETUP_PATH}`);
  return fs.readFileSync(SETUP_PATH).toString('utf8');
}

test('set-up 引导与 README 的 BYOM 定位一致（不绑定服务商）', () => {
  const md = setupMd();
  assert.match(md, /BYOM|bring your own model/i, 'set-up 应明示 BYOM 定位');
  assert.match(
    md,
    /不绑定任何服务商|不预绑任何服务商|不默认指向任何服务商|由你.*提供|自行填写/,
    'set-up 应声明服务商由用户自带、不绑定任何服务商',
  );
});

test('set-up 说明 apiKey 可留空（而非必填）', () => {
  const md = setupMd();
  assert.match(md, /apiKey/);
  assert.match(md, /可留空|留空|可选/, 'set-up 应说明 apiKey 可留空');
  assert.doesNotMatch(md, /apiKey[^\n]*必填/, 'set-up 不应宣称 apiKey 必填');
});

test('set-up 不应宣称 openai 默认指向任何服务商', () => {
  const md = setupMd();
  assert.doesNotMatch(md, /openai[^\n]*默认指向/, 'set-up 不应宣称 openai 默认指向某服务商');
});

test('set-up 的 doctor 核对清单包含激活协议（六项齐全）', () => {
  const md = setupMd();
  assert.match(md, /激活协议/, 'set-up doctor 核对清单应包含激活协议');
  assert.match(md, /config 文件/);
  assert.match(md, /协议段/);
  assert.match(md, /Node 版本/);
  assert.match(md, /dist\/|编译产物/);
  assert.match(md, /schema/);
});
