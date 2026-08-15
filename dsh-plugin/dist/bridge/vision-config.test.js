import { test } from 'node:test';
import * as assert from 'node:assert';
import { DEFAULT_VISION_API_KEY_ENV, DEFAULT_VISION_PROTOCOL, VISION_ENV, resolveVisionConfig, } from './vision-config.js';
/**
 * 视觉端点配置解析（cordis.yml + env fallback，apiKey 仅从 env 读取）的纯逻辑测试。
 * 全程离线：env 以普通对象注入，不触碰 process.env，不发起任何请求。
 * 本票（#27）只要求解析就绪，不消费该配置（视觉调用归 #28/#29）。
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
    const cfg = resolveVisionConfig({ protocol: 'anthropic', baseUrl: 'https://vision-yml.example.com/v1', model: 'yml-model' }, {
        [VISION_ENV.protocol]: 'responses',
        [VISION_ENV.baseUrl]: 'https://vision-env.example.com/v1',
        [VISION_ENV.model]: 'env-model',
    });
    assert.equal(cfg.protocol, 'anthropic');
    assert.equal(cfg.baseUrl, 'https://vision-yml.example.com/v1');
    assert.equal(cfg.model, 'yml-model');
});
test('env fallback：cordis.yml 缺省时从环境变量补齐 baseUrl/model/protocol', () => {
    const cfg = resolveVisionConfig({}, {
        [VISION_ENV.protocol]: 'responses',
        [VISION_ENV.baseUrl]: 'https://vision-env.example.com/v1',
        [VISION_ENV.model]: 'env-model',
    });
    assert.equal(cfg.protocol, 'responses');
    assert.equal(cfg.baseUrl, 'https://vision-env.example.com/v1');
    assert.equal(cfg.model, 'env-model');
});
test('apiKey 仅从 env 读取：默认环境变量 PERISCOPE_API_KEY', () => {
    const cfg = resolveVisionConfig({}, { [DEFAULT_VISION_API_KEY_ENV]: 'sk-vision' });
    assert.equal(cfg.apiKey, 'sk-vision');
});
test('apiKeyEnv 可在 cordis.yml 命名环境变量；apiKey 从该变量读取（配置永不承载字面 key）', () => {
    const cfg = resolveVisionConfig({ apiKeyEnv: 'MY_VISION_KEY' }, { MY_VISION_KEY: 'sk-custom', [DEFAULT_VISION_API_KEY_ENV]: 'sk-default' });
    assert.equal(cfg.apiKeyEnv, 'MY_VISION_KEY');
    assert.equal(cfg.apiKey, 'sk-custom', '应从 apiKeyEnv 命名的变量读取，而非默认变量');
});
test('apiKey 无法经 cordis.yml 注入：VisionConfigInput 没有 apiKey 字段', () => {
    // 即使调用方强行塞入 apiKey 字段，解析结果也不应采用它（仅 env 生效）。
    const malicious = { apiKey: 'sk-from-yml' };
    const cfg = resolveVisionConfig(malicious, {});
    assert.equal(cfg.apiKey, '', '字面 key 不是配置值，cordis.yml 里的 apiKey 必须被忽略');
});
test('空白串视为未配置：input.baseUrl 为空白时回落到 env', () => {
    const cfg = resolveVisionConfig({ baseUrl: '   ', model: '' }, { [VISION_ENV.baseUrl]: 'https://vision-env.example.com/v1', [VISION_ENV.model]: 'env-model' });
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
