import { test } from 'node:test';
import * as assert from 'node:assert';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createMockServer } from './testing/mock-server';
import { makeTempDir, makeTestEnv, writeConfigFile, writeFixtureImage } from './testing/fixtures';
import { runHook } from './testing/hook';

const execFileP = promisify(execFile);
/** 编译后测试位于 dist/，describe 独立脚本与 hook 入口即同目录产物。 */
const DESCRIBE_ENTRY = path.join(__dirname, 'cli', 'describe.js');
const HOOK_ENTRY = path.join(__dirname, 'hook', 'index.js');

function smokeEnv(configPath: string): Record<string, string | undefined> {
  return makeTestEnv(configPath, {
    apiKey: 'sk-smoke',
    homePrefix: 'periscope-smoke-home-',
    cacheDir: makeTempDir('periscope-smoke-cache-'),
  });
}

test('smoke: README 描述的 CLI 单图用法端到端可运行（mock 端点）', async (t) => {
  const server = await createMockServer({
    defaultBody: JSON.stringify({ choices: [{ message: { content: '窗台上的猫' } }] }),
  });
  t.after(() => server.close());

  const dir = makeTempDir();
  const imagePath = writeFixtureImage(dir);
  const configPath = writeConfigFile(dir, {
    openai: { baseUrl: server.baseUrl, model: 'vision-model' },
  }).path;

  const { stdout, stderr } = await execFileP(process.execPath, [
    DESCRIBE_ENTRY,
    imagePath,
    '--intent',
    '描述这张图片',
  ], { env: smokeEnv(configPath) });

  assert.equal(stdout, '窗台上的猫\n', '单图应输出纯文本描述');
  assert.equal(stderr, '');
});

test('smoke: CLI 多图 + URL 远程图逐行输出 ${source}: ${desc}', async (t) => {
  const dir = makeTempDir();
  const img1 = writeFixtureImage(dir, 'a.png');

  const server = await createMockServer({
    handler: (req) => {
      const url = (req.jsonBody as any).messages[0].content[1].image_url.url as string;
      const content = url.startsWith('data:image/png;base64,') ? '本地图描述' : 'URL 图描述';
      return { status: 200, body: JSON.stringify({ choices: [{ message: { content } }] }) };
    },
  });
  t.after(() => server.close());

  const configPath = writeConfigFile(dir, {
    openai: { baseUrl: server.baseUrl, model: 'vision-model' },
  }).path;
  const url = 'https://example.com/cat.png';

  const { stdout, stderr } = await execFileP(process.execPath, [
    DESCRIBE_ENTRY,
    img1,
    url,
  ], { env: smokeEnv(configPath) });

  assert.equal(stdout, `${img1}: 本地图描述\n${url}: URL 图描述\n`, '多图应逐行 ${source}: ${desc}');
  assert.equal(stderr, '');
  assert.equal(server.requests.length, 2);
});

test('smoke: README 描述的 hook 贴图注入端到端可运行（mock 端点）', async (t) => {
  const server = await createMockServer({
    defaultBody: JSON.stringify({ choices: [{ message: { content: 'mock 描述' } }] }),
  });
  t.after(() => server.close());

  const dir = makeTempDir();
  const img1 = writeFixtureImage(dir, 'a.png');
  const img2 = writeFixtureImage(dir, 'b.png');
  const configPath = writeConfigFile(dir, {
    openai: { baseUrl: server.baseUrl, model: 'vision-model' },
  }).path;

  const stdin = JSON.stringify({
    session_id: 'smoke-1',
    hook_event_name: 'UserPromptSubmit',
    prompt: '看图',
    image_count: 2,
    image_paths: [img1, img2],
  });
  const { stdout, stderr, code } = await runHook(HOOK_ENTRY, stdin, smokeEnv(configPath));
  const parsed = JSON.parse(stdout) as any;

  assert.equal(code, 0);
  assert.equal(stderr, '');
  assert.equal(parsed.decision, 'approve', 'hook 始终放行');
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(parsed.hookSpecificOutput.additionalContext, /\[Image 1\] a\.png: mock 描述/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /\[Image 2\] b\.png: mock 描述/);
});

test('smoke: hook 无图片时放行且 additionalContext 为空串', async (t) => {
  const server = await createMockServer();
  t.after(() => server.close());

  const dir = makeTempDir();
  const configPath = writeConfigFile(dir).path;

  const stdin = JSON.stringify({
    hook_event_name: 'UserPromptSubmit',
    prompt: '无图',
    image_paths: [],
  });
  const { stdout, code } = await runHook(HOOK_ENTRY, stdin, smokeEnv(configPath));
  const parsed = JSON.parse(stdout) as any;

  assert.equal(code, 0);
  assert.equal(parsed.decision, 'approve');
  assert.equal(parsed.hookSpecificOutput.additionalContext, '');
  assert.equal(server.requests.length, 0, '无图不应发视觉请求');
});
