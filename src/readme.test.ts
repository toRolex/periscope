import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** 编译后位于 dist/readme.test.js，仓库根即 __dirname 的上一级。 */
const REPO_ROOT = path.join(__dirname, '..');
const README_PATH = path.join(REPO_ROOT, 'README.md');

function readme(): string {
  assert.ok(fs.existsSync(README_PATH), `README 应存在于仓库根: ${README_PATH}`);
  return fs.readFileSync(README_PATH).toString('utf8');
}

test('README 存在且覆盖安装步骤', () => {
  const md = readme();
  assert.match(md, /安装/);
  assert.match(md, /(pnpm|npm|yarn) (install|i)/);
  assert.match(md, /(git clone|git pull|build|dist)/);
});

test('README 配置说明覆盖三协议与字段（protocol / baseUrl / model）', () => {
  const md = readme();
  assert.match(md, /openai/);
  assert.match(md, /anthropic/);
  assert.match(md, /responses/);
  assert.match(md, /protocol/);
  assert.match(md, /baseUrl/);
  assert.match(md, /model/);
});

test('README 说明环境变量（apiKey / config / cacheDir）', () => {
  const md = readme();
  assert.match(md, /PERISCOPE_API_KEY/);
  assert.match(md, /PERISCOPE_CONFIG/);
  assert.match(md, /PERISCOPE_CACHE_DIR/);
});

test('README 说明 CLI 用法（describe / 多图 / URL / --intent）', () => {
  const md = readme();
  assert.match(md, /periscope describe/);
  assert.match(md, /--intent/);
  assert.match(md, /URL/);
});

test('README 说明 hook 贴图注入与放行语义', () => {
  const md = readme();
  assert.match(md, /UserPromptSubmit/);
  assert.match(md, /\[Image \d+\]/);
  assert.match(md, /approve/);
  assert.match(md, /additionalContext/);
});

test('README 含 marketplace 发布说明', () => {
  const md = readme();
  assert.match(md, /marketplace/i);
  assert.match(md, /发布/);
});

test('README 含常见问题（FAQ）', () => {
  const md = readme();
  assert.match(md, /常见问题|FAQ/i);
});

test('README 含真实视觉 LLM 人工实测指南', () => {
  const md = readme();
  assert.match(md, /人工实测|实测指南/);
});
