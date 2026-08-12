import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe } from './describe';
import { createMockServer } from '../testing/mock-server';
import { makeTempDir, readyEndpoint, writeConfigFile, writeFixtureImage } from '../testing/fixtures';

/** 每用例独立的临时缓存目录 + fixture 图片 + 指向 mock 端点的配置。 */
function setup(server: { baseUrl: string }) {
  const dir = makeTempDir();
  const cacheDir = path.join(dir, 'cache');
  const imagePath = writeFixtureImage(dir);
  const config = writeConfigFile(dir, {
    apiKey: 'sk-cache',
    openai: readyEndpoint(server.baseUrl),
  }).config;
  return { dir, cacheDir, imagePath, config };
}

test('缓存命中：同 key 第二次 describe 复用上次结果，不发起视觉 API 请求', async (t) => {
  let calls = 0;
  const server = await createMockServer({
    handler: () => {
      calls += 1;
      return {
        status: 200,
        body: JSON.stringify({ choices: [{ message: { content: `第${calls}次描述` } }] }),
      };
    },
  });
  t.after(() => server.close());
  const { cacheDir, imagePath, config } = setup(server);

  const first = await describe({ imagePath }, { config, cacheDir });
  assert.equal(first, '第1次描述');

  const second = await describe({ imagePath }, { config, cacheDir });
  assert.equal(second, '第1次描述', '命中缓存应返回上次结果，而非第2次的响应');
  assert.equal(calls, 1, '同 key 不应重复请求视觉 API');
  assert.equal(server.requests.length, 1);
});

test('缓存持久化：缓存条目落盘，同一 key 的多次调用只请求一次', async (t) => {
  const server = await createMockServer();
  t.after(() => server.close());
  const { cacheDir, imagePath, config } = setup(server);

  await describe({ imagePath }, { config, cacheDir });
  await describe({ imagePath }, { config, cacheDir });
  await describe({ imagePath }, { config, cacheDir });
  assert.equal(server.requests.length, 1, '三次 describe 应只发起一次请求');
});

test('图片修改时间变化后重新调用视觉 API', async (t) => {
  const server = await createMockServer();
  t.after(() => server.close());
  const { cacheDir, imagePath, config } = setup(server);

  await describe({ imagePath }, { config, cacheDir });
  assert.equal(server.requests.length, 1);

  const past = new Date(Date.now() - 60_000);
  fs.utimesSync(imagePath, past, past);
  await describe({ imagePath }, { config, cacheDir });
  assert.equal(server.requests.length, 2, 'mtime 变化后应重新请求');
});

test('图片大小变化后重新调用视觉 API', async (t) => {
  const server = await createMockServer();
  t.after(() => server.close());
  const { cacheDir, imagePath, config } = setup(server);

  await describe({ imagePath }, { config, cacheDir });
  assert.equal(server.requests.length, 1);

  fs.writeFileSync(imagePath, 'changed-content');
  await describe({ imagePath }, { config, cacheDir });
  assert.equal(server.requests.length, 2, '大小变化后应重新请求');
});

test('不同路径的图片各自独立请求，不复用缓存', async (t) => {
  const server = await createMockServer();
  t.after(() => server.close());
  const { dir, cacheDir, config } = setup(server);
  const a = writeFixtureImage(dir, 'a.png');
  const b = writeFixtureImage(dir, 'b.png');

  await describe({ imagePath: a }, { config, cacheDir });
  await describe({ imagePath: b }, { config, cacheDir });
  assert.equal(server.requests.length, 2, '路径不同应各自请求');
});

test('同图同 intent 命中缓存；不同 intent 视为不同 key 重新请求', async (t) => {
  const server = await createMockServer();
  t.after(() => server.close());
  const { cacheDir, imagePath, config } = setup(server);

  await describe({ imagePath, intent: '看颜色' }, { config, cacheDir });
  await describe({ imagePath, intent: '看颜色' }, { config, cacheDir });
  assert.equal(server.requests.length, 1, '同图同意图第二次应命中缓存');

  await describe({ imagePath, intent: '看形状' }, { config, cacheDir });
  assert.equal(server.requests.length, 2, '同图不同意图应重新请求');
});
