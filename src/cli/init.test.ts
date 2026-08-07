import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { DEFAULT_CONFIG } from '../config/config';
import { makeTempDir } from '../testing/fixtures';
import { runInit } from './init';

function mockStdin(lines: string[]): Readable {
  const r = new Readable({ read() {} });
  for (const line of lines) {
    r.push(`${line}\n`);
  }
  r.push(null);
  return r;
}

class StringWritable extends Writable {
  data = '';
  _write(chunk: Buffer, _enc: string, cb: () => void): void {
    this.data += chunk.toString('utf8');
    cb();
  }
}

function tmpEnv(): Record<string, string> {
  return {
    HOME: makeTempDir('periscope-init-home-'),
  };
}

test('init 通过 stdin 接收选择题 → 写出完整 config.json（结构与 DEFAULT_CONFIG 一致）', async () => {
  const dir = makeTempDir('periscope-init-out-');
  const configPath = path.join(dir, 'config.json');
  const stdin = mockStdin(['openai', 'https://my.example.com/v1', 'my-model', 'sk-test-key']);
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.equal(code, 0);
  assert.ok(fs.existsSync(configPath), '配置文件应被写出');
  const written = JSON.parse(fs.readFileSync(configPath).toString('utf8')) as Record<string, unknown>;
  assert.equal(written.protocol, 'openai');
  assert.equal(written.apiKey, 'sk-test-key');
  const openai = written.openai as { baseUrl: string; model: string };
  assert.equal(openai.baseUrl, 'https://my.example.com/v1');
  assert.equal(openai.model, 'my-model');
  // 其他协议段保留 DEFAULT_CONFIG 完整 baseUrl + model
  assert.deepEqual(written.anthropic, DEFAULT_CONFIG.anthropic);
  assert.deepEqual(written.responses, DEFAULT_CONFIG.responses);
});

test('init 选择 anthropic 协议 → config.json 的 anthropic.baseUrl/model 写入用户选择', async () => {
  const dir = makeTempDir('periscope-init-out-');
  const configPath = path.join(dir, 'config.json');
  const stdin = mockStdin(['anthropic', 'https://api.anthropic.com', 'claude-3-5-sonnet-latest', 'sk-anthropic']);
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.equal(code, 0);
  const written = JSON.parse(fs.readFileSync(configPath).toString('utf8'));
  assert.equal(written.protocol, 'anthropic');
  const anthropic = written.anthropic as { baseUrl: string; model: string };
  assert.equal(anthropic.baseUrl, 'https://api.anthropic.com');
  assert.equal(anthropic.model, 'claude-3-5-sonnet-latest');
  assert.equal(written.apiKey, 'sk-anthropic');
});

test('init 目标配置文件已存在 → 拒绝覆盖、stderr 提示原因、退出码非零', async () => {
  const dir = makeTempDir('periscope-init-existing-');
  const configPath = path.join(dir, 'config.json');
  const originalContent = JSON.stringify({ ...DEFAULT_CONFIG, apiKey: 'preserved-key' }, null, 2);
  fs.writeFileSync(configPath, originalContent);

  const stdin = mockStdin(['openai', 'https://x', 'm', 'k']);
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.notEqual(code, 0);
  assert.match(stderr.data, /已存在/);
  // 拒绝时原文件字节不变
  const after = fs.readFileSync(configPath).toString('utf8');
  assert.equal(after, originalContent, '现有配置文件不应被修改');
  assert.match(after, /preserved-key/, '现有 apiKey 应原样保留');
});

test('init stdin EOF（无任何回答） → 报错到 stderr + 非零退出码', async () => {
  const dir = makeTempDir('periscope-init-eof-');
  const configPath = path.join(dir, 'config.json');
  const stdin = mockStdin([]);
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.notEqual(code, 0);
  assert.ok(stderr.data.length > 0, 'EOF 时应输出错误信息');
  assert.ok(!fs.existsSync(configPath), 'EOF 失败时不应写出配置文件');
});

test('init 协议输入非 openai/anthropic/responses → 报错 + 非零退出码', async () => {
  const dir = makeTempDir('periscope-init-bad-proto-');
  const configPath = path.join(dir, 'config.json');
  const stdin = mockStdin(['bogus']);
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.notEqual(code, 0);
  assert.ok(!fs.existsSync(configPath), '协议无效时不应写出配置文件');
});

test('init 写入的 JSON 顶层字段齐全：protocol / apiKey / openai / anthropic / responses', async () => {
  const dir = makeTempDir('periscope-init-shape-');
  const configPath = path.join(dir, 'config.json');
  const stdin = mockStdin(['responses', 'https://api.openai.com/v1', 'gpt-4o-mini', 'sk-r']);
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.equal(code, 0);
  const written = JSON.parse(fs.readFileSync(configPath).toString('utf8'));
  for (const key of ['protocol', 'apiKey', 'openai', 'anthropic', 'responses']) {
    assert.ok(key in written, `顶层字段 ${key} 必须存在`);
  }
});

test('init 在 PERISCOPE_CONFIG 未设置时使用 HOME/.config/periscope/config.json', async () => {
  const home = makeTempDir('periscope-init-homeonly-');
  const expected = path.join(home, '.config', 'periscope', 'config.json');
  const stdin = mockStdin(['openai', 'https://x', 'm', 'k']);
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { HOME: home });

  assert.equal(code, 0);
  assert.ok(fs.existsSync(expected), `应写入 HOME 派生路径: ${expected}`);
});