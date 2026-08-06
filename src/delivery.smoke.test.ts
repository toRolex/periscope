import { test } from 'node:test';
import * as assert from 'node:assert';
import * as path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG } from './config/config';
import { createMockServer } from './testing/mock-server';
import { makeTempDir, writeConfigFile, writeFixtureImage } from './testing/fixtures';

const execFileP = promisify(execFile);
/** 编译后测试位于 dist/，CLI 与 hook 入口即同目录产物。 */
const CLI_ENTRY = path.join(__dirname, 'cli', 'index.js');
const HOOK_ENTRY = path.join(__dirname, 'hook', 'index.js');

function smokeEnv(configPath: string): Record<string, string | undefined> {
  return {
    ...process.env,
    PERISCOPE_CONFIG: configPath,
    PERISCOPE_API_KEY: 'sk-smoke',
    // 隔离真实 HOME 与缓存，避免 smoke 污染用户目录
    HOME: makeTempDir('periscope-smoke-home-'),
    PERISCOPE_CACHE_DIR: makeTempDir('periscope-smoke-cache-'),
  };
}

/** spawn 编译后 hook，写入 stdin JSON，返回 stdout/stderr/退出码。 */
function runHook(
  stdin: string,
  env: Record<string, string | undefined>,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK_ENTRY], { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: { toString(): string }) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: { toString(): string }) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code: number | null) => {
      resolve({ stdout, stderr, code: code ?? -1 });
    });
    child.stdin.write(stdin);
    child.stdin.end();
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
    openai: { ...DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
  }).path;

  const { stdout, stderr } = await execFileP(process.execPath, [
    CLI_ENTRY,
    'describe',
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
    openai: { ...DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
  }).path;
  const url = 'https://example.com/cat.png';

  const { stdout, stderr } = await execFileP(process.execPath, [
    CLI_ENTRY,
    'describe',
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
    openai: { ...DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
  }).path;

  const stdin = JSON.stringify({
    session_id: 'smoke-1',
    hook_event_name: 'UserPromptSubmit',
    prompt: '看图',
    image_count: 2,
    image_paths: [img1, img2],
  });
  const { stdout, stderr, code } = await runHook(stdin, smokeEnv(configPath));
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
  const { stdout, code } = await runHook(stdin, smokeEnv(configPath));
  const parsed = JSON.parse(stdout) as any;

  assert.equal(code, 0);
  assert.equal(parsed.decision, 'approve');
  assert.equal(parsed.hookSpecificOutput.additionalContext, '');
  assert.equal(server.requests.length, 0, '无图不应发视觉请求');
});
