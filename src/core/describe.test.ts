import { test } from 'node:test';
import * as assert from 'node:assert';
import * as path from 'node:path';
import { describe } from './describe';
import { DEFAULT_CONFIG } from '../config/config';
import { createMockServer } from '../testing/mock-server';
import { makeTempDir, writeConfigFile, writeFixtureImage } from '../testing/fixtures';

test('describe 通过 mock 端点发送 openai 协议请求并提取文本', async (t) => {
  const server = await createMockServer({
    defaultBody: JSON.stringify({ choices: [{ message: { content: '图片里有一座山' } }] }),
  });
  t.after(() => server.close());

  const dir = makeTempDir();
  const imagePath = writeFixtureImage(dir);
  const config = writeConfigFile(dir, {
    apiKey: 'sk-core',
    openai: { ...DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
  }).config;

  const text = await describe({ imagePath }, { config });

  assert.equal(text, '图片里有一座山');
  assert.equal(server.requests.length, 1);
  const req = server.requests[0];
  assert.equal(req.method, 'POST');
  assert.equal(req.url, '/chat/completions');
  assert.equal(req.headers['authorization'], 'Bearer sk-core');
  assert.equal(req.headers['content-type'], 'application/json');
  const body = req.jsonBody as any;
  assert.equal(body.model, 'qwen-vl-max');
  assert.equal(body.messages[0].content[1].type, 'image_url');
  assert.ok(body.messages[0].content[1].image_url.url.startsWith('data:image/png;base64,'));
});

test('describe 透传 intent 到 text 部分', async (t) => {
  const server = await createMockServer();
  t.after(() => server.close());

  const dir = makeTempDir();
  const imagePath = writeFixtureImage(dir);
  const config = writeConfigFile(dir, {
    openai: { ...DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
  }).config;

  await describe({ imagePath, intent: '用中文描述颜色' }, { config });

  const body = server.requests[0].jsonBody as any;
  assert.equal(body.messages[0].content[0].text, '用中文描述颜色');
});

test('describe 端点返回非 2xx 时抛错', async (t) => {
  const server = await createMockServer({
    defaultStatus: 401,
    defaultBody: '{"error":"unauthorized"}',
  });
  t.after(() => server.close());

  const dir = makeTempDir();
  const imagePath = writeFixtureImage(dir);
  const config = writeConfigFile(dir, {
    openai: { ...DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
  }).config;

  await assert.rejects(describe({ imagePath }, { config }), /HTTP 401/);
});

test('describe 2xx 但响应非 JSON 时透传原始文本', async (t) => {
  const server = await createMockServer({
    defaultStatus: 200,
    defaultBody: '这是一个纯文本描述',
  });
  t.after(() => server.close());

  const dir = makeTempDir();
  const imagePath = writeFixtureImage(dir);
  const config = writeConfigFile(dir, {
    openai: { ...DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
  }).config;

  const text = await describe({ imagePath }, { config });
  assert.equal(text, '这是一个纯文本描述');
});

test('describe 图片文件不存在时抛错', async () => {
  const dir = makeTempDir();
  const config = writeConfigFile(dir, { apiKey: 'sk' }).config;
  await assert.rejects(
    describe({ imagePath: path.join(dir, 'missing.png') }, { config }),
    /无法读取图片文件/,
  );
});

test('describe 未注入配置时走 loadConfig：环境变量优先于文件 apiKey', async (t) => {
  const server = await createMockServer();
  t.after(() => server.close());

  const dir = makeTempDir();
  const imagePath = writeFixtureImage(dir);
  const configPath = writeConfigFile(dir, {
    apiKey: 'sk-file',
    openai: { ...DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
  }).path;

  const pathBefore = process.env.PERISCOPE_CONFIG;
  const keyBefore = process.env.PERISCOPE_API_KEY;
  process.env.PERISCOPE_CONFIG = configPath;
  process.env.PERISCOPE_API_KEY = 'sk-env';
  try {
    const text = await describe({ imagePath });
    assert.equal(text, 'mock 默认描述');
    assert.equal(server.requests[0].headers['authorization'], 'Bearer sk-env');
  } finally {
    if (pathBefore === undefined) delete process.env.PERISCOPE_CONFIG;
    else process.env.PERISCOPE_CONFIG = pathBefore;
    if (keyBefore === undefined) delete process.env.PERISCOPE_API_KEY;
    else process.env.PERISCOPE_API_KEY = keyBefore;
  }
});

test('describe 通过 mock 端点发送 anthropic v1/messages 请求并提取文本', async (t) => {
  const server = await createMockServer({
    defaultBody: JSON.stringify({
      content: [{ type: 'text', text: '图片里有一座山' }],
    }),
  });
  t.after(() => server.close());

  const dir = makeTempDir();
  const imagePath = writeFixtureImage(dir);
  const config = writeConfigFile(dir, {
    protocol: 'anthropic',
    apiKey: 'sk-ant-core',
    anthropic: { ...DEFAULT_CONFIG.anthropic, baseUrl: server.baseUrl },
  }).config;

  const text = await describe({ imagePath }, { config });

  assert.equal(text, '图片里有一座山');
  assert.equal(server.requests.length, 1);
  const req = server.requests[0];
  assert.equal(req.method, 'POST');
  assert.equal(req.url, '/v1/messages');
  assert.equal(req.headers['x-api-key'], 'sk-ant-core');
  assert.equal(req.headers['anthropic-version'], '2023-06-01');
  assert.equal(req.headers['content-type'], 'application/json');
  const body = req.jsonBody as any;
  assert.equal(body.model, DEFAULT_CONFIG.anthropic.model);
  assert.equal(body.messages[0].content[0].text, '描述这张图片');
  assert.equal(body.messages[0].content[1].type, 'image');
  assert.equal(body.messages[0].content[1].source.type, 'base64');
  assert.equal(body.messages[0].content[1].source.media_type, 'image/png');
  assert.ok(
    typeof body.messages[0].content[1].source.data === 'string' &&
      body.messages[0].content[1].source.data.length > 0,
    'anthropic image data 应为 base64 字符串',
  );
});

test('describe 通过 mock 端点发送 responses v1/responses 请求并提取文本', async (t) => {
  const server = await createMockServer({
    defaultBody: JSON.stringify({
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: '图片里有一条河' }],
        },
      ],
    }),
  });
  t.after(() => server.close());

  const dir = makeTempDir();
  const imagePath = writeFixtureImage(dir);
  const config = writeConfigFile(dir, {
    protocol: 'responses',
    apiKey: 'sk-resp-core',
    responses: { ...DEFAULT_CONFIG.responses, baseUrl: server.baseUrl },
  }).config;

  const text = await describe({ imagePath }, { config });

  assert.equal(text, '图片里有一条河');
  assert.equal(server.requests.length, 1);
  const req = server.requests[0];
  assert.equal(req.method, 'POST');
  assert.equal(req.url, '/responses');
  assert.equal(req.headers['authorization'], 'Bearer sk-resp-core');
  assert.equal(req.headers['content-type'], 'application/json');
  const body = req.jsonBody as any;
  assert.equal(body.model, DEFAULT_CONFIG.responses.model);
  assert.equal(body.input[0].content[0].type, 'input_text');
  assert.equal(body.input[0].content[0].text, '描述这张图片');
  assert.equal(body.input[0].content[1].type, 'input_image');
  assert.ok(
    body.input[0].content[1].image_url.startsWith('data:image/png;base64,'),
  );
});

test('describe 2xx 但 anthropic 响应非 JSON 时透传原始文本', async (t) => {
  const server = await createMockServer({
    defaultStatus: 200,
    defaultBody: '纯文本的 anthropic 描述',
  });
  t.after(() => server.close());

  const dir = makeTempDir();
  const imagePath = writeFixtureImage(dir);
  const config = writeConfigFile(dir, {
    protocol: 'anthropic',
    anthropic: { ...DEFAULT_CONFIG.anthropic, baseUrl: server.baseUrl },
  }).config;

  const text = await describe({ imagePath }, { config });
  assert.equal(text, '纯文本的 anthropic 描述');
});

test('describe 2xx 但 responses 响应非 JSON 时透传原始文本', async (t) => {
  const server = await createMockServer({
    defaultStatus: 200,
    defaultBody: '纯文本的 responses 描述',
  });
  t.after(() => server.close());

  const dir = makeTempDir();
  const imagePath = writeFixtureImage(dir);
  const config = writeConfigFile(dir, {
    protocol: 'responses',
    responses: { ...DEFAULT_CONFIG.responses, baseUrl: server.baseUrl },
  }).config;

  const text = await describe({ imagePath }, { config });
  assert.equal(text, '纯文本的 responses 描述');
});

test('describe anthropic 端点返回非 2xx 时抛错', async (t) => {
  const server = await createMockServer({
    defaultStatus: 429,
    defaultBody: '{"error":"rate limited"}',
  });
  t.after(() => server.close());

  const dir = makeTempDir();
  const imagePath = writeFixtureImage(dir);
  const config = writeConfigFile(dir, {
    protocol: 'anthropic',
    anthropic: { ...DEFAULT_CONFIG.anthropic, baseUrl: server.baseUrl },
  }).config;

  await assert.rejects(describe({ imagePath }, { config }), /HTTP 429/);
});
