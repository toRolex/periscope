import { test } from 'node:test';
import * as assert from 'node:assert';
import {
  DELEGATE_PROVIDER,
  INPUT_MODALITIES,
  PERISCOPE_MODELS,
  PERISCOPE_PROVIDER,
  buildProviderInfo,
  listRouteModels,
  resolveRouteModel,
  toDelegateOptions,
} from './route.js';

/**
 * periscope-deepseek route 的纯逻辑测试：能力声明形状（inputModalities 含 image，
 * 为看图放行 admission）与纯文本委托改写（provider 重写为 deepseek 主文本路由）。
 * 全程离线，不触碰 dsh 运行时（dsh 集成壳归手工 E2E，见 plugin.ts 注释）。
 */

test('route id 自解释：periscope-deepseek', () => {
  assert.equal(PERISCOPE_PROVIDER, 'periscope-deepseek');
});

test('委托目标为已核实的 deepseek 主文本路由 deepseek-official', () => {
  assert.equal(DELEGATE_PROVIDER, 'deepseek-official');
});

test('能力声明含 text 与 image：带图 prompt 不在 admission 被拒', () => {
  assert.ok(INPUT_MODALITIES.includes('image'), '必须声明 image 输入能力');
  assert.ok(INPUT_MODALITIES.includes('text'), '必须声明 text 输入能力');
});

test('providerInfo：id 等于 route，name 非空供选择器展示', () => {
  const info = buildProviderInfo(PERISCOPE_PROVIDER);
  assert.equal(info.id, 'periscope-deepseek');
  assert.ok(info.name.length > 0, '选择器需要可读名称');
});

test('listRouteModels：每个广告模型都声明 image 能力（Web UI 选择器数据来源）', () => {
  const models = listRouteModels(PERISCOPE_PROVIDER);
  assert.ok(models.length > 0, '选择器至少需要一个模型');
  for (const m of models) {
    assert.equal(m.provider, 'periscope-deepseek');
    assert.ok(m.inputModalities.includes('image'), `模型 ${m.id} 应声明 image`);
    assert.ok(m.inputModalities.includes('text'), `模型 ${m.id} 应声明 text`);
  }
});

test('广告模型沿用 deepseek 线协议 id（委托时 model 原样透传才有效）', () => {
  const ids = PERISCOPE_MODELS.map((m) => m.id);
  assert.ok(ids.includes('deepseek-v4-flash'));
  assert.ok(ids.includes('deepseek-v4-pro'));
});

test('resolveRouteModel：已知 id 返回该模型且带 image 能力', () => {
  const m = resolveRouteModel(PERISCOPE_PROVIDER, 'deepseek-v4-flash');
  assert.equal(m.id, 'deepseek-v4-flash');
  assert.ok(m.inputModalities.includes('image'));
});

test('resolveRouteModel：未知 id 也声明 image 能力（catalog 是 advisory，不放行判定时缺省即拒绝）', () => {
  const m = resolveRouteModel(PERISCOPE_PROVIDER, 'some-future-model');
  assert.equal(m.id, 'some-future-model');
  assert.ok(m.inputModalities.includes('image'), '未知模型也要放行 admission');
});

test('toDelegateOptions：provider 重写为 deepseek-official，model/messages/其余字段原样透传', () => {
  const options = {
    provider: PERISCOPE_PROVIDER,
    model: 'deepseek-v4-flash',
    messages: [{ role: 'user', content: '你好' }],
    temperature: 0.7,
    system: 'sys',
  };
  const delegated = toDelegateOptions(options);
  assert.equal(delegated.provider, 'deepseek-official', '委托必须改到 deepseek 主文本路由');
  assert.equal(delegated.model, 'deepseek-v4-flash', 'model 原样透传');
  assert.deepEqual(delegated.messages, options.messages, 'messages 原样透传');
  assert.equal(delegated.temperature, 0.7);
  assert.equal(delegated.system, 'sys');
});

test('toDelegateOptions：不改动入参对象（纯函数）', () => {
  const options = { provider: PERISCOPE_PROVIDER, model: 'deepseek-v4-flash' };
  const delegated = toDelegateOptions(options);
  assert.notEqual(delegated, options, '应返回新对象');
  assert.equal(options.provider, PERISCOPE_PROVIDER, '入参 provider 不被改写');
});
