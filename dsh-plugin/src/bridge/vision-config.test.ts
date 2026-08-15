import { test } from 'node:test';
import * as assert from 'node:assert';
import {
  DEFAULT_VISION_API_KEY_ENV,
  DEFAULT_VISION_PROTOCOL,
  VISION_ENV,
  mergeVisionInputs,
  normalizeSettingsSection,
  resolveVisionConfig,
  resolveVisionConfigWithSettings,
} from './vision-config.js';
import type { VisionSettingsSection } from './vision-config.js';

/**
 * 视觉端点配置解析（cordis.yml + env fallback + settings 命名空间三来源，apiKey 仅从 env 读取）
 * 的纯逻辑测试。全程离线：env 以普通对象注入，settings 以归一化输入注入，不触碰 process.env、
 * 不依赖 dsh 运行时、不发起任何请求。
 * 本票（#27）只要求解析就绪，不消费该配置（视觉调用归 #28/#29）。
 * #33 新增：settings 命名空间作为第三来源（归一化 + 与 cordis.yml 合并 + 优先级），
 * 归一化函数保持纯函数、零 dsh 耦合，沿用本文件的离线注入模式。
 */

test('空输入 + 空环境：解析出空白视觉端点（protocol 默认 openai，baseUrl/model/apiKey 空串）', () => {
  const cfg = resolveVisionConfig({}, {});
  assert.equal(cfg.protocol, 'openai');
  assert.equal(cfg.baseUrl, '');
  assert.equal(cfg.model, '');
  assert.equal(cfg.apiKeyEnv, DEFAULT_VISION_API_KEY_ENV);
  assert.equal(cfg.apiKey, '');
});

test('cordis.yml（input）值优先于 env：baseUrl/model/protocol 均取 input', () => {
  const cfg = resolveVisionConfig(
    { protocol: 'anthropic', baseUrl: 'https://vision-yml.example.com/v1', model: 'yml-model' },
    {
      [VISION_ENV.protocol]: 'responses',
      [VISION_ENV.baseUrl]: 'https://vision-env.example.com/v1',
      [VISION_ENV.model]: 'env-model',
    },
  );
  assert.equal(cfg.protocol, 'anthropic');
  assert.equal(cfg.baseUrl, 'https://vision-yml.example.com/v1');
  assert.equal(cfg.model, 'yml-model');
});

test('env fallback：cordis.yml 缺省时从环境变量补齐 baseUrl/model/protocol', () => {
  const cfg = resolveVisionConfig(
    {},
    {
      [VISION_ENV.protocol]: 'responses',
      [VISION_ENV.baseUrl]: 'https://vision-env.example.com/v1',
      [VISION_ENV.model]: 'env-model',
    },
  );
  assert.equal(cfg.protocol, 'responses');
  assert.equal(cfg.baseUrl, 'https://vision-env.example.com/v1');
  assert.equal(cfg.model, 'env-model');
});

test('apiKey 仅从 env 读取：默认环境变量 PERISCOPE_API_KEY', () => {
  const cfg = resolveVisionConfig({}, { [DEFAULT_VISION_API_KEY_ENV]: 'sk-vision' });
  assert.equal(cfg.apiKey, 'sk-vision');
});

test('apiKeyEnv 可在 cordis.yml 命名环境变量；apiKey 从该变量读取（配置永不承载字面 key）', () => {
  const cfg = resolveVisionConfig(
    { apiKeyEnv: 'MY_VISION_KEY' },
    { MY_VISION_KEY: 'sk-custom', [DEFAULT_VISION_API_KEY_ENV]: 'sk-default' },
  );
  assert.equal(cfg.apiKeyEnv, 'MY_VISION_KEY');
  assert.equal(cfg.apiKey, 'sk-custom', '应从 apiKeyEnv 命名的变量读取，而非默认变量');
});

test('apiKey 无法经 cordis.yml 注入：VisionConfigInput 没有 apiKey 字段', () => {
  // 即使调用方强行塞入 apiKey 字段，解析结果也不应采用它（仅 env 生效）。
  const malicious = { apiKey: 'sk-from-yml' } as unknown as Record<string, never>;
  const cfg = resolveVisionConfig(malicious, {});
  assert.equal(cfg.apiKey, '', '字面 key 不是配置值，cordis.yml 里的 apiKey 必须被忽略');
});

test('空白串视为未配置：input.baseUrl 为空白时回落到 env', () => {
  const cfg = resolveVisionConfig(
    { baseUrl: '   ', model: '' },
    { [VISION_ENV.baseUrl]: 'https://vision-env.example.com/v1', [VISION_ENV.model]: 'env-model' },
  );
  assert.equal(cfg.baseUrl, 'https://vision-env.example.com/v1');
  assert.equal(cfg.model, 'env-model');
});

test('非法 protocol（env 注入垃圾值）回落到默认 openai', () => {
  const cfg = resolveVisionConfig({}, { [VISION_ENV.protocol]: 'not-a-protocol' });
  assert.equal(cfg.protocol, DEFAULT_VISION_PROTOCOL);
});

test('input.protocol 合法联合值（anthropic/responses）原样采用', () => {
  assert.equal(resolveVisionConfig({ protocol: 'responses' }, {}).protocol, 'responses');
  assert.equal(resolveVisionConfig({ protocol: 'anthropic' }, {}).protocol, 'anthropic');
});

test('缺省参数等价于空输入（cordis 省略整个配置段时）', () => {
  const cfg = resolveVisionConfig();
  assert.equal(cfg.protocol, 'openai');
  assert.equal(cfg.apiKey, '');
});

// ── #33 settings 命名空间归一化（normalizeSettingsSection） ──────────────────

test('normalizeSettingsSection：null/undefined/空段 → 空输入（全部走 env fallback）', () => {
  assert.deepEqual(normalizeSettingsSection(undefined), {});
  assert.deepEqual(normalizeSettingsSection(null), {});
  assert.deepEqual(normalizeSettingsSection({}), {});
});

test('normalizeSettingsSection：保留非空白四字段，空白/空白串视为未配置丢弃', () => {
  assert.deepEqual(
    normalizeSettingsSection({
      protocol: 'anthropic',
      baseUrl: 'https://settings.example.com/v1',
      model: 'settings-model',
      apiKeyEnv: 'MY_VISION_KEY',
    }),
    {
      protocol: 'anthropic',
      baseUrl: 'https://settings.example.com/v1',
      model: 'settings-model',
      apiKeyEnv: 'MY_VISION_KEY',
    },
  );
  assert.deepEqual(
    normalizeSettingsSection({ protocol: '   ' as never, baseUrl: '', model: undefined }),
    {},
    '空白/缺省字段全部丢弃',
  );
});

test('normalizeSettingsSection：非法 protocol 原样透传（校验归 resolveVisionConfig 裁决）', () => {
  assert.deepEqual(
    normalizeSettingsSection({ protocol: 'not-a-protocol' as never }),
    { protocol: 'not-a-protocol' as never },
  );
});

// ── #33 settings 与 cordis.yml 合并（mergeVisionInputs） ─────────────────────

test('mergeVisionInputs：settings 逐字段优先于 cordis；settings 缺省时回落 cordis', () => {
  const merged = mergeVisionInputs(
    { protocol: 'openai', baseUrl: 'https://yml.example.com/v1', model: 'yml-model' },
    { protocol: 'anthropic', model: 'settings-model' },
  );
  assert.deepEqual(merged, {
    protocol: 'anthropic',
    baseUrl: 'https://yml.example.com/v1',
    model: 'settings-model',
  });
});

test('mergeVisionInputs：空白 settings 视为未配置，回落到 cordis', () => {
  const merged = mergeVisionInputs(
    { baseUrl: 'https://yml.example.com/v1', model: 'yml-model' },
    { baseUrl: '   ', model: '' },
  );
  assert.deepEqual(merged, { baseUrl: 'https://yml.example.com/v1', model: 'yml-model' });
});

test('mergeVisionInputs：两者皆缺省 → 字段留空（交 resolveVisionConfig 走 env fallback）', () => {
  assert.deepEqual(mergeVisionInputs({}, {}), {});
  assert.deepEqual(mergeVisionInputs({ baseUrl: 'https://yml.example.com/v1' }, {}), {
    baseUrl: 'https://yml.example.com/v1',
  });
});

test('mergeVisionInputs：不改写入参（纯函数）', () => {
  const cordis = { baseUrl: 'https://yml.example.com/v1' };
  const settings = { model: 'settings-model' };
  const merged = mergeVisionInputs(cordis, settings);
  assert.deepEqual(cordis, { baseUrl: 'https://yml.example.com/v1' }, 'cordis 入参不被改动');
  assert.deepEqual(settings, { model: 'settings-model' }, 'settings 入参不被改动');
  assert.notEqual(merged, cordis);
  assert.notEqual(merged, settings);
});

// ── #33 三来源汇入 resolveVisionConfigWithSettings（settings > cordis > env） ─

test('resolveVisionConfigWithSettings：settings 优先、cordis 兜底、env fallback 的完整优先级', () => {
  const cfg = resolveVisionConfigWithSettings(
    // cordis.yml（base 层）
    { protocol: 'openai', baseUrl: 'https://yml.example.com/v1', model: 'yml-model', apiKeyEnv: 'YML_KEY' },
    // settings 命名空间（user 层）：protocol/model/apiKeyEnv 覆盖，baseUrl 缺省
    { protocol: 'anthropic', model: 'settings-model', apiKeyEnv: 'SETTINGS_KEY' },
    // env fallback + apiKey 源
    {
      [VISION_ENV.protocol]: 'responses',
      [VISION_ENV.baseUrl]: 'https://env.example.com/v1',
      [VISION_ENV.model]: 'env-model',
      YML_KEY: 'sk-yml',
      SETTINGS_KEY: 'sk-settings',
      [DEFAULT_VISION_API_KEY_ENV]: 'sk-default',
    },
  );
  assert.equal(cfg.protocol, 'anthropic', 'settings protocol 优先于 cordis/env');
  assert.equal(cfg.baseUrl, 'https://yml.example.com/v1', 'settings 缺 baseUrl → 回落 cordis');
  assert.equal(cfg.model, 'settings-model', 'settings model 优先');
  assert.equal(cfg.apiKeyEnv, 'SETTINGS_KEY');
  assert.equal(cfg.apiKey, 'sk-settings', 'apiKey 从 settings 命名的环境变量读取');
});

test('resolveVisionConfigWithSettings：settings/cordis 均缺 baseUrl → env fallback', () => {
  const cfg = resolveVisionConfigWithSettings(
    { model: 'yml-model' },
    { model: '' },
    { [VISION_ENV.baseUrl]: 'https://env.example.com/v1' },
  );
  assert.equal(cfg.baseUrl, 'https://env.example.com/v1');
  assert.equal(cfg.model, 'yml-model', 'settings 空白 model 回落 cordis（不回落 env）');
});

test('resolveVisionConfigWithSettings：settings 缺省 → 等价于原 cordis + env 双来源', () => {
  const withSettings = resolveVisionConfigWithSettings(
    { baseUrl: 'https://yml.example.com/v1' },
    undefined,
    { [VISION_ENV.model]: 'env-model' },
  );
  const plain = resolveVisionConfig({ baseUrl: 'https://yml.example.com/v1' }, { [VISION_ENV.model]: 'env-model' });
  assert.deepEqual(withSettings, plain);
});

test('apiKey 仅从 env 读取：settings/cordis 均无法注入字面 key（归一化输入无 apiKey 字段）', () => {
  const maliciousSettings = { apiKey: 'sk-from-settings' } as unknown as VisionSettingsSection;
  const cfg = resolveVisionConfigWithSettings({}, maliciousSettings, {});
  assert.equal(cfg.apiKey, '', 'settings 里的字面 key 不是配置值，必须被忽略');
});

test('resolveVisionConfigWithSettings：非法 settings protocol 回落默认 openai（与 cordis 同契约）', () => {
  const cfg = resolveVisionConfigWithSettings({}, { protocol: 'not-a-protocol' as never }, {});
  assert.equal(cfg.protocol, DEFAULT_VISION_PROTOCOL);
});
