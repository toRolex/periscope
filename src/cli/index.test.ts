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

test('CLI 接受多张图片并按传入顺序聚合输出', async (t) => {
  const dir = makeTempDir();
  const img1 = writeFixtureImage(dir, 'a.png');
  const img2 = path.join(dir, 'b.png');
  const secondBase64 = Buffer.from('second-image-bytes', 'utf8').toString('base64');
  fs.writeFileSync(img2, Buffer.from('second-image-bytes', 'utf8'));

  const server = await createMockServer({
    handler: (req) => {
      const url = (req.jsonBody as any).messages[0].content[1].image_url.url as string;
      const content = url.includes(secondBase64) ? '第二张描述' : '第一张描述';
      return { status: 200, body: JSON.stringify({ choices: [{ message: { content } }] }) };
    },
  });
  t.after(() => server.close());

  const configPath = writeConfigFile(dir, {
    openai: { ...DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
  }).path;

  const { stdout, stderr } = await execFileP(process.execPath, [
    CLI_ENTRY,
    'describe',
    img1,
    img2,
  ], { env: cliEnv(configPath) });

  assert.equal(stdout, `${img1}: 第一张描述\n${img2}: 第二张描述\n`);
  assert.equal(stderr, '');
  assert.equal(server.requests.length, 2);
});

test('CLI 多图一败一胜：stdout 保留成功描述，stderr 标注失败，退出码非零', async (t) => {
  const server = await createMockServer({
    defaultBody: JSON.stringify({ choices: [{ message: { content: '成功图描述' } }] }),
  });
  t.after(() => server.close());

  const dir = makeTempDir();
  const img1 = writeFixtureImage(dir, 'a.png');
  const missing = path.join(dir, 'missing.png');
  const configPath = writeConfigFile(dir, {
    openai: { ...DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
  }).path;

  const err: any = await execFileP(process.execPath, [
    CLI_ENTRY,
    'describe',
    img1,
    missing,
  ], { env: cliEnv(configPath) }).catch((e: unknown) => e);

  assert.notEqual(err.code, 0, '有失败项时退出码应非零');
  assert.match(err.stdout, new RegExp(`${img1}: 成功图描述`), '成功项描述应保留在 stdout');
  assert.match(err.stderr, /无法读取图片文件/, '失败信息应走 stderr');
  assert.equal(server.requests.length, 1, '缺失图不发起请求，成功图只请求一次');
});

test('CLI 接受 URL 远程图片并输出描述', async (t) => {
  const server = await createMockServer({
    defaultBody: JSON.stringify({ choices: [{ message: { content: 'URL 图描述' } }] }),
  });
  t.after(() => server.close());

  const dir = makeTempDir();
  const configPath = writeConfigFile(dir, {
    openai: { ...DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
  }).path;
  const url = 'https://example.com/cat.png';

  const { stdout, stderr } = await execFileP(process.execPath, [
    CLI_ENTRY,
    'describe',
    url,
  ], { env: cliEnv(configPath) });

  assert.equal(stdout, 'URL 图描述\n');
  assert.equal(stderr, '');
  const body = server.requests[0].jsonBody as any;
  assert.equal(body.messages[0].content[1].image_url.url, url);
});
