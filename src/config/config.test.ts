import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { configPathForEnv, DEFAULT_CONFIG, defaultConfigPath, loadConfig } from './config';
import { Protocol } from '../protocols/types';
import { makeTempDir, withEnv } from '../testing/fixtures';

test('首次运行懒创建：PERISCOPE_CONFIG 指向的路径自动生成默认配置', () => {
  const dir = makeTempDir();
  const configPath = path.join(dir, 'nested', 'config.json');
  withEnv({ PERISCOPE_CONFIG: configPath, PERISCOPE_API_KEY: undefined }, () => {
    const cfg = loadConfig();
    assert.equal(cfg.protocol, 'openai');
    assert.equal(cfg.apiKey, '');
    assert.equal(
      cfg.openai.baseUrl,
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    );
    assert.equal(cfg.openai.model, 'qwen-vl-max');
    assert.ok(cfg.anthropic, '默认配置应含 anthropic 扩展位');
    assert.ok(cfg.responses, '默认配置应含 responses 扩展位');
    assert.ok(fs.existsSync(configPath), '配置文件应被自动创建');
    const written = JSON.parse(fs.readFileSync(configPath).toString('utf8'));
    assert.equal(written.protocol, 'openai');
    assert.equal(written.apiKey, '');
  });
});

test('默认配置含 anthropic/responses 的 baseUrl 与 model', () => {
  assert.equal(DEFAULT_CONFIG.anthropic.baseUrl, 'https://api.anthropic.com');
  assert.equal(DEFAULT_CONFIG.anthropic.model, 'claude-3-5-sonnet-latest');
  assert.equal(DEFAULT_CONFIG.responses.baseUrl, 'https://api.openai.com/v1');
  assert.equal(DEFAULT_CONFIG.responses.model, 'gpt-4o-mini');
});

test('默认配置路径为 HOME/.config/periscope/config.json，且可被 PERISCOPE_CONFIG 覆盖', () => {
  const dir = makeTempDir();
  withEnv({ PERISCOPE_CONFIG: undefined, HOME: dir }, () => {
    assert.equal(
      defaultConfigPath(),
      path.join(dir, '.config', 'periscope', 'config.json'),
    );
  });
  const overridePath = path.join(dir, 'custom.json');
  withEnv({ PERISCOPE_CONFIG: overridePath }, () => {
    assert.equal(defaultConfigPath(), overridePath);
  });
});

test('configPathForEnv：PERISCOPE_CONFIG 优先，否则 HOME 派生', () => {
  const dir = makeTempDir();
  assert.equal(
    configPathForEnv({ HOME: dir }),
    path.join(dir, '.config', 'periscope', 'config.json'),
  );
  const override = path.join(dir, 'custom.json');
  assert.equal(
    configPathForEnv({ HOME: dir, PERISCOPE_CONFIG: override }),
    override,
  );
});

test('configPathForEnv：HOME 缺省时用 os.homedir() 兜底', () => {
  const dir = makeTempDir();
  withEnv({ HOME: dir }, () => {
    assert.equal(
      configPathForEnv({}),
      path.join(dir, '.config', 'periscope', 'config.json'),
    );
  });
});

test('PERISCOPE_API_KEY 环境变量优先于配置文件中的 apiKey', () => {
  const dir = makeTempDir();
  const configPath = path.join(dir, 'config.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify({ ...DEFAULT_CONFIG, apiKey: 'file-key' }),
  );
  withEnv({ PERISCOPE_CONFIG: configPath, PERISCOPE_API_KEY: 'env-key' }, () => {
    assert.equal(loadConfig().apiKey, 'env-key');
  });
});

test('未设置环境变量时使用配置文件中的 apiKey', () => {
  const dir = makeTempDir();
  const configPath = path.join(dir, 'config.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify({ ...DEFAULT_CONFIG, apiKey: 'file-key' }),
  );
  withEnv({ PERISCOPE_CONFIG: configPath, PERISCOPE_API_KEY: undefined }, () => {
    assert.equal(loadConfig().apiKey, 'file-key');
  });
});

test('默认配置 apiKey 为空字符串', () => {
  const dir = makeTempDir();
  const configPath = path.join(dir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG));
  withEnv({ PERISCOPE_CONFIG: configPath, PERISCOPE_API_KEY: undefined }, () => {
    assert.equal(loadConfig().apiKey, '');
  });
});

test('配置文件只改 openai.baseUrl：openai.model 保留默认、其他协议段默认值完整', () => {
  const dir = makeTempDir();
  const configPath = path.join(dir, 'config.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify({ openai: { baseUrl: 'https://my-gateway.example.com/v1' } }),
  );
  withEnv({ PERISCOPE_CONFIG: configPath, PERISCOPE_API_KEY: undefined }, () => {
    const cfg = loadConfig();
    assert.equal(cfg.openai.baseUrl, 'https://my-gateway.example.com/v1');
    assert.equal(cfg.openai.model, 'qwen-vl-max', '未修改的 openai.model 应保留默认值');
    assert.equal(cfg.protocol, 'openai', '顶层 protocol 保持默认');
    assert.equal(cfg.anthropic.baseUrl, DEFAULT_CONFIG.anthropic.baseUrl);
    assert.equal(cfg.anthropic.model, DEFAULT_CONFIG.anthropic.model);
    assert.equal(cfg.responses.baseUrl, DEFAULT_CONFIG.responses.baseUrl);
    assert.equal(cfg.responses.model, DEFAULT_CONFIG.responses.model);
  });
});

test('DEFAULT_CONFIG.protocol 为 Protocol 联合类型（openai/anthropic/responses）', () => {
  const p: Protocol = DEFAULT_CONFIG.protocol;
  assert.ok(['openai', 'anthropic', 'responses'].includes(p));
});
