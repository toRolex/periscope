// 双宿主 describe 引擎契约测试（纯 JS，零编译零依赖）。
// 对两个宿主的**编译产物**（dist）做运行时形状断言——dist 形态正是
// engine 包 exports 条件映射要面对的运行时。同时可见双方，防跨宿主 drift。
// 刻意差异（白名单）：
//   - DescribeInput：主仓 imagePath（本地文件/URL），dsh bytes+source（字节输入）
//   - DescribeOptions：主仓多 cacheDir（磁盘缓存，dsh 无 fs 缓存）
//   - describeMany 的 source 回退：dsh 无 source 输入时回退「图片 N」，主仓回显 imagePath
// 白名单之外的任何漂移（函数缺失、形状变化、容错语义变化）都应使本测试红。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// 主仓：CommonJS dist
const ccDescribe = require('../dist/core/describe.js');
// dsh：ESM dist
const dshDescribe = await import('../dsh-plugin/dist/core/describe.js');

/** 两个宿主都接受的注入面：有效 openai 端点 + mock transport。 */
const config = {
  protocol: 'openai',
  apiKey: '',
  openai: { baseUrl: 'http://localhost:9999', model: 'test-model' },
  anthropic: { baseUrl: '', model: '' },
  responses: { baseUrl: '', model: '' },
};

/** mock transport：请求 url 由 baseUrl 派生，不含图片源路径，故用独立实例区分成败。 */
const okTransport = {
  post: async () => ({ ok: true, status: 200, text: '测试描述' }),
};
const failTransport = {
  post: async () => ({ ok: false, status: 500, text: 'boom' }),
};
/** 第 2 次调用失败（describeMany 逐图容错用）。 */
const makePartialFailTransport = () => {
  let n = 0;
  return {
    post: async () => {
      n += 1;
      if (n === 2) return { ok: false, status: 500, text: 'boom' };
      return { ok: true, status: 200, text: '测试描述' };
    },
  };
};

test('双宿主 describe 函数面都存在', () => {
  assert.equal(typeof ccDescribe.describe, 'function');
  assert.equal(typeof ccDescribe.describeMany, 'function');
  assert.equal(typeof dshDescribe.describe, 'function');
  assert.equal(typeof dshDescribe.describeMany, 'function');
});

test('成功路径：注入 transport/config 后返回描述文本（两宿主一致）', async () => {
  const opts = { config, transport: okTransport };
  const ccText = await ccDescribe.describe(
    { imagePath: 'https://a.example.com/img.png' },
    opts,
  );
  const dshText = await dshDescribe.describe(
    { bytes: new Uint8Array([1, 2, 3]) },
    opts,
  );
  assert.equal(ccText, '测试描述');
  assert.equal(dshText, '测试描述');
});

test('失败路径：非 2xx 两宿主都 reject，且 message 含 HTTP 状态', async () => {
  const opts = { config, transport: failTransport };
  await assert.rejects(
    ccDescribe.describe({ imagePath: 'https://a.example.com/img.png' }, opts),
    /HTTP 500/,
  );
  await assert.rejects(
    dshDescribe.describe({ bytes: new Uint8Array([1, 2, 3]) }, opts),
    /HTTP 500/,
  );
});

test('describeMany：逐图容错聚合，source/description/error 形状一致', async () => {
  const ccOutcomes = await ccDescribe.describeMany(
    [
      { imagePath: 'https://a.example.com/ok.png' },
      { imagePath: 'https://b.example.com/fail.png' },
    ],
    { config, transport: makePartialFailTransport() },
  );
  assert.equal(ccOutcomes.length, 2);
  assert.equal(ccOutcomes[0].source, 'https://a.example.com/ok.png');
  assert.equal(ccOutcomes[0].description, '测试描述');
  assert.equal(ccOutcomes[0].error, undefined);
  assert.equal(ccOutcomes[1].source, 'https://b.example.com/fail.png');
  assert.equal(ccOutcomes[1].description, null);
  assert.equal(typeof ccOutcomes[1].error, 'string');

  const dshOutcomes = await dshDescribe.describeMany(
    [{ bytes: new Uint8Array([1, 2, 3]), source: '图-1' }],
    { config, transport: okTransport },
  );
  assert.equal(dshOutcomes.length, 1);
  assert.equal(dshOutcomes[0].source, '图-1');
  assert.equal(dshOutcomes[0].description, '测试描述');
  assert.equal(dshOutcomes[0].error, undefined);
});

test('白名单：主仓支持 cacheDir:null 关闭磁盘缓存，dsh 忽略未知字段', async () => {
  // 两宿主都传 cacheDir（主仓白名单字段；dsh 无该字段，运行时忽略）。
  const ccText = await ccDescribe.describe(
    { imagePath: 'https://a.example.com/img.png' },
    { config, transport: okTransport, cacheDir: null },
  );
  const dshText = await dshDescribe.describe(
    { bytes: new Uint8Array([1, 2, 3]) },
    { config, transport: okTransport, cacheDir: null },
  );
  assert.equal(ccText, '测试描述');
  assert.equal(dshText, '测试描述');
});
