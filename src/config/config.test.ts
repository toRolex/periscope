import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_CONFIG, defaultConfigPath, loadConfig } from './config';
import { makeTempDir } from '../testing/fixtures';

/** 临时设置/删除若干环境变量，测试结束自动还原。 */
function withEnv(
  env: Record<string, string | undefined>,
  fn: () => void,
): void {
  const saved = new Map<string, string | undefined>();
  for (const key of Object.keys(env)) {
    saved.set(key, process.env[key]);
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  try {
    fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

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
