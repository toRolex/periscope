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
  // 开发说明：test 命令应为 Node 20+ 兼容写法（无引号 glob）。
  assert.match(md, /node --test/);
  assert.doesNotMatch(md, /node --test "dist/, 'README 不应记录带引号 glob 的旧 test 命令');
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

test('README 说明 init 子命令（交互式 / 拒绝覆盖 / 无 --force）', () => {
  const md = readme();
  assert.match(md, /periscope init/);
  assert.match(md, /拒绝覆盖|已存在/);
  assert.match(md, /没有 `--force`|无 --force|--force.*(不支持|未提供|没有)/);
});

test('README 说明 doctor 子命令（5 项本地自检 / --offline 语义）', () => {
  const md = readme();
  assert.match(md, /periscope doctor/);
  assert.match(md, /--offline/);
  assert.match(md, /离线模式/);
  // 五项自检都提到
  assert.match(md, /config 文件|配置文件/);
  assert.match(md, /协议段/);
  assert.match(md, /Node 版本/);
  assert.match(md, /dist\//);
  assert.match(md, /plugin\.json.*schema|schema.*plugin\.json/);
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

test('README 含「Agent Plugins 1.0.0 合规」说明段（issue #10 AC3）', () => {
  const md = readme();
  // 标题/章节存在
  assert.match(md, /Agent Plugins 1\.0\.0/, 'README 应提及 Agent Plugins 1.0.0');
  assert.match(md, /合规|兼容/);
  // 兼容 harness 列表：五个客户端
  assert.match(md, /VS Code/);
  assert.match(md, /ChatGPT/);
  assert.match(md, /Kiro/);
  assert.match(md, /GitHub Copilot|Copilot/);
  assert.match(md, /Cursor/);
  // Skill 路径说明
  assert.match(md, /skills\/(describe-image|<name>)/);
  assert.match(md, /SKILL\.md/);
  // 不上 MCP
  assert.match(md, /不上 MCP|不暴露 MCP|不注册 MCP|不做 MCP|不做 MCP server|MCP server/);
});
