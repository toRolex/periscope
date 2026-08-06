import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG } from '../config/config';
import { createMockServer } from '../testing/mock-server';
import { makeTempDir, writeConfigFile, writeFixtureImage } from '../testing/fixtures';

const execFileP = promisify(execFile);
/** 编译后测试位于 dist/cli/，CLI 入口即同目录的 index.js。 */
const CLI_ENTRY = path.join(__dirname, 'index.js');

function cliEnv(configPath: string): Record<string, string | undefined> {
  return {
    ...process.env,
    PERISCOPE_CONFIG: configPath,
    PERISCOPE_API_KEY: 'sk-cli',
    // 隔离真实 HOME，避免 CLI 意外写入用户配置目录
    HOME: makeTempDir('periscope-cli-home-'),
  };
}

test('CLI describe 输出纯文本描述到 stdout 并以 0 退出', async (t) => {
  const server = await createMockServer({
    defaultBody: JSON.stringify({ choices: [{ message: { content: '一只猫' } }] }),
  });
  t.after(() => server.close());

  const dir = makeTempDir();
  const imagePath = writeFixtureImage(dir);
  const configPath = writeConfigFile(dir, {
    openai: { ...DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
  }).path;

  const { stdout, stderr } = await execFileP(process.execPath, [
    CLI_ENTRY,
    'describe',
    imagePath,
    '--intent',
    '看看猫',
  ], { env: cliEnv(configPath) });

  assert.equal(stdout, '一只猫\n');
  assert.equal(stderr, '');
  const body = server.requests[0].jsonBody as any;
  assert.equal(body.messages[0].content[0].text, '看看猫');
  assert.equal(
    body.messages[0].content[1].image_url.url.startsWith('data:image/png;base64,'),
    true,
  );
});

test('CLI 首次运行自动生成默认配置文件（openai + DashScope 端点）', async () => {
  const dir = makeTempDir();
  const configPath = path.join(dir, 'fresh', 'config.json');

  const err: any = await execFileP(process.execPath, [
    CLI_ENTRY,
    'describe',
    path.join(dir, 'nope.png'),
  ], { env: cliEnv(configPath) }).catch((e: unknown) => e);

  assert.notEqual(err.code, 0);
  assert.ok(fs.existsSync(configPath), '配置文件应被懒创建');
  const written = JSON.parse(fs.readFileSync(configPath).toString('utf8'));
  assert.equal(written.protocol, 'openai');
  assert.equal(written.apiKey, '');
  assert.equal(
    written.openai.baseUrl,
    'https://dashscope.aliyuncs.com/compatible-mode/v1',
  );
});

test('CLI 缺少图片路径 → stderr 报错 + 非零退出码', async () => {
  const dir = makeTempDir();
  const configPath = writeConfigFile(dir).path;

  const err: any = await execFileP(process.execPath, [CLI_ENTRY, 'describe'], {
    env: cliEnv(configPath),
  }).catch((e: unknown) => e);

  assert.notEqual(err.code, 0);
  assert.match(err.stderr, /缺少图片路径/);
  assert.match(err.stderr, /用法/);
});

test('CLI 图片不存在 → stderr 报错 + 非零退出码', async () => {
  const dir = makeTempDir();
  const configPath = writeConfigFile(dir, { apiKey: 'sk' }).path;

  const err: any = await execFileP(process.execPath, [
    CLI_ENTRY,
    'describe',
    path.join(dir, 'nope.png'),
  ], { env: cliEnv(configPath) }).catch((e: unknown) => e);

  assert.notEqual(err.code, 0);
  assert.match(err.stderr, /无法读取图片文件/);
});

test('CLI 端点返回 500 → stderr 报错 + 非零退出码', async (t) => {
  const server = await createMockServer({
    defaultStatus: 500,
    defaultBody: 'server error',
  });
  t.after(() => server.close());

  const dir = makeTempDir();
  const imagePath = writeFixtureImage(dir);
  const configPath = writeConfigFile(dir, {
    openai: { ...DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
  }).path;

  const err: any = await execFileP(process.execPath, [CLI_ENTRY, 'describe', imagePath], {
    env: cliEnv(configPath),
  }).catch((e: unknown) => e);

  assert.notEqual(err.code, 0);
  assert.match(err.stderr, /HTTP 500/);
});

test('CLI 未知命令 → stderr 用法 + 非零退出码', async () => {
  const err: any = await execFileP(process.execPath, [CLI_ENTRY, 'foo'], {
    env: cliEnv(makeTempDir()),
  }).catch((e: unknown) => e);

  assert.notEqual(err.code, 0);
  assert.match(err.stderr, /用法/);
});
