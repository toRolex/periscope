import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { DEFAULT_CONFIG } from '../config/config';
import { makeTempDir, StringWritable } from '../testing/fixtures';
import { runInit } from './init';

/** 模拟 TTY 的 stdin：isTTY=true + setRawMode 存根，供 readline keypress 解码使用。 */
interface TtyReadable extends Readable {
  isTTY: boolean;
  setRawMode(mode: boolean): void;
}

/** 构造模拟 TTY 的 stdin，并一次性 push 全部字节（readline 解码为 keypress 事件）。 */
function ttyStdin(chunks: string[]): TtyReadable {
  const r = new Readable({ read() {} }) as TtyReadable;
  r.isTTY = true;
  r.setRawMode = () => {};
  for (const chunk of chunks) r.push(chunk);
  return r;
}

/** 构造非 TTY 的 stdin（普通 Readable，无 isTTY）——模拟管道/重定向环境。 */
function plainStdin(chunks: string[]): Readable {
  const r = new Readable({ read() {} });
  for (const chunk of chunks) r.push(chunk);
  return r;
}

interface InteractiveOpts {
  /** 协议选择按键序列：方向键 + 回车，缺省直接回车（默认 openai）。 */
  proto?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  /** 确认按键：y/n + 换行，缺省 'y\n'。 */
  confirm?: string;
}

/**
 * 组装一次完整交互的按键序列：
 * 协议选择 → baseUrl → model → apiKey → 确认。
 * 字段缺省即留空（回车直接提交空值），用于校验必填拦截。
 */
function interactiveChunks(opts: InteractiveOpts = {}): string[] {
  const chunks: string[] = [opts.proto ?? '\r'];
  chunks.push(opts.baseUrl !== undefined ? `${opts.baseUrl}\r` : '\r');
  chunks.push(opts.model !== undefined ? `${opts.model}\r` : '\r');
  chunks.push(opts.apiKey !== undefined ? `${opts.apiKey}\r` : '\r');
  chunks.push(opts.confirm ?? 'y\n');
  return chunks;
}

function tmpEnv(): Record<string, string> {
  return { HOME: makeTempDir('periscope-init-home-') };
}

function readWrittenConfig(configPath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(configPath).toString('utf8')) as Record<string, unknown>;
}

test('init 非 TTY（管道/重定向）环境 → stderr 报错 + 非零退出，不进入交互、不写配置', async () => {
  const dir = makeTempDir('periscope-init-nottty-');
  const configPath = path.join(dir, 'config.json');
  const stdin = plainStdin(interactiveChunks({ baseUrl: 'https://x', model: 'm', apiKey: 'k' }));
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.notEqual(code, 0);
  assert.match(stderr.data, /交互式终端|TTY/);
  assert.equal(stdout.data, '', '非 TTY 不应进入交互流程');
  assert.ok(!fs.existsSync(configPath), '非 TTY 不应写出配置文件');
});

test('init 默认高亮 openai：直接回车确认 → 写入 openai 配置', async () => {
  const dir = makeTempDir('periscope-init-default-');
  const configPath = path.join(dir, 'config.json');
  const stdin = ttyStdin(interactiveChunks({ baseUrl: 'https://x.example/v1', model: 'model-x', apiKey: 'sk-1' }));
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.equal(code, 0, stderr.data);
  assert.match(stdout.data, /❯ openai/, '默认应高亮 openai');
  assert.doesNotMatch(stdout.data, /❯ anthropic/, '未按方向键时不应高亮 anthropic');
  const written = readWrittenConfig(configPath);
  assert.equal(written.protocol, 'openai');
  assert.equal(written.apiKey, 'sk-1');
  const openai = written.openai as { baseUrl: string; model: string };
  assert.equal(openai.baseUrl, 'https://x.example/v1');
  assert.equal(openai.model, 'model-x');
  // 未选中的协议段保留 DEFAULT_CONFIG 空白模板（baseUrl/model 为空串）
  assert.deepEqual(written.anthropic, DEFAULT_CONFIG.anthropic);
  assert.deepEqual(written.responses, DEFAULT_CONFIG.responses);
});

test('init 方向键 ↓ 切换到 anthropic，回车确认 → 写入 anthropic 配置', async () => {
  const dir = makeTempDir('periscope-init-down-');
  const configPath = path.join(dir, 'config.json');
  const stdin = ttyStdin(interactiveChunks({
    proto: '\x1b[B\r',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-3-5-sonnet-latest',
    apiKey: 'sk-an',
  }));
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.equal(code, 0, stderr.data);
  assert.match(stdout.data, /❯ anthropic/, '方向键下移后应高亮 anthropic');
  const written = readWrittenConfig(configPath);
  assert.equal(written.protocol, 'anthropic');
  const anthropic = written.anthropic as { baseUrl: string; model: string };
  assert.equal(anthropic.baseUrl, 'https://api.anthropic.com');
  assert.equal(anthropic.model, 'claude-3-5-sonnet-latest');
  assert.equal(written.apiKey, 'sk-an');
});

test('init 方向键 ↓↓ 切换到 responses，回车确认 → 写入 responses 配置', async () => {
  const dir = makeTempDir('periscope-init-responses-');
  const configPath = path.join(dir, 'config.json');
  const stdin = ttyStdin(interactiveChunks({
    proto: '\x1b[B\x1b[B\r',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: 'sk-r',
  }));
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.equal(code, 0, stderr.data);
  assert.match(stdout.data, /❯ responses/, '方向键下移两次后应高亮 responses');
  const written = readWrittenConfig(configPath);
  assert.equal(written.protocol, 'responses');
  const responses = written.responses as { baseUrl: string; model: string };
  assert.equal(responses.baseUrl, 'https://api.openai.com/v1');
  assert.equal(responses.model, 'gpt-4o-mini');
});

test('init 方向键 ↑ 从默认 openai 回绕到 responses（循环选择）', async () => {
  const dir = makeTempDir('periscope-init-up-');
  const configPath = path.join(dir, 'config.json');
  const stdin = ttyStdin(interactiveChunks({
    proto: '\x1b[A\r',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: 'sk-up',
  }));
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.equal(code, 0, stderr.data);
  assert.match(stdout.data, /❯ responses/, '上移应回绕到 responses');
  const written = readWrittenConfig(configPath);
  assert.equal(written.protocol, 'responses');
});

test('init 协议选择期间普通字符被忽略（白名单之外输入不改变选择），回车仍选默认 openai', async () => {
  const dir = makeTempDir('periscope-init-whitelist-');
  const configPath = path.join(dir, 'config.json');
  const stdin = ttyStdin(interactiveChunks({
    proto: 'bogus\r',
    baseUrl: 'https://x',
    model: 'm',
    apiKey: 'k',
  }));
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.equal(code, 0, stderr.data);
  assert.match(stdout.data, /❯ openai/, '无效按键不应移动高亮');
  const written = readWrittenConfig(configPath);
  assert.equal(written.protocol, 'openai', '白名单外输入应被忽略');
});

test('init baseUrl 留空 → 拦截 + 非零退出，不写出配置', async () => {
  const dir = makeTempDir('periscope-init-empty-baseurl-');
  const configPath = path.join(dir, 'config.json');
  const stdin = ttyStdin(interactiveChunks({ baseUrl: '', model: 'm', apiKey: 'k' }));
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.notEqual(code, 0);
  assert.match(stderr.data, /baseUrl.*不能为空|不能为空/);
  assert.ok(!fs.existsSync(configPath), 'baseUrl 留空不应写出配置');
});

test('init model 留空 → 拦截 + 非零退出，不写出配置', async () => {
  const dir = makeTempDir('periscope-init-empty-model-');
  const configPath = path.join(dir, 'config.json');
  const stdin = ttyStdin(interactiveChunks({ baseUrl: 'https://x', model: '', apiKey: 'k' }));
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.notEqual(code, 0);
  assert.match(stderr.data, /model.*不能为空|不能为空/);
  assert.ok(!fs.existsSync(configPath), 'model 留空不应写出配置');
});

test('init apiKey 留空（回车直接提交）→ 完成写入，apiKey 为空串', async () => {
  const dir = makeTempDir('periscope-init-empty-apikey-');
  const configPath = path.join(dir, 'config.json');
  const stdin = ttyStdin(interactiveChunks({ baseUrl: 'http://localhost:1234/v1', model: 'm', apiKey: '' }));
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.equal(code, 0, stderr.data);
  const written = readWrittenConfig(configPath);
  assert.equal(written.apiKey, '', 'apiKey 留空应写入空串');
  const openai = written.openai as { baseUrl: string; model: string };
  assert.equal(openai.baseUrl, 'http://localhost:1234/v1');
  assert.equal(openai.model, 'm');
  assert.match(stdout.data, /apiKey:\s*\n/, '摘要应展示 apiKey 为空');
});

test('init 填写完成后展示配置摘要（协议/baseUrl/model/apiKey），无既有配置时无覆盖警告', async () => {
  const dir = makeTempDir('periscope-init-summary-');
  const configPath = path.join(dir, 'config.json');
  const stdin = ttyStdin(interactiveChunks({ baseUrl: 'https://x/v1', model: 'my-model', apiKey: 'sk-summary' }));
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.equal(code, 0, stderr.data);
  assert.match(stdout.data, /配置摘要/);
  assert.match(stdout.data, /协议:\s*openai/);
  assert.match(stdout.data, /baseUrl:\s*https:\/\/x\/v1/);
  assert.match(stdout.data, /model:\s*my-model/);
  assert.match(stdout.data, /apiKey:\s*sk-summary/);
  assert.doesNotMatch(stdout.data, /将覆盖现有配置/, '无既有配置时不应出现覆盖警告');
});

test('init 已有配置时摘要后警告「将覆盖现有配置」，y 确认后覆盖写入', async () => {
  const dir = makeTempDir('periscope-init-overwrite-');
  const configPath = path.join(dir, 'config.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify({ ...DEFAULT_CONFIG, apiKey: 'old-key' }, null, 2),
  );
  const stdin = ttyStdin(interactiveChunks({ baseUrl: 'https://new/v1', model: 'new-model', apiKey: 'new-key' }));
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.equal(code, 0, stderr.data);
  assert.match(stdout.data, /将覆盖现有配置/, '已有配置时应明确警告覆盖');
  const written = readWrittenConfig(configPath);
  assert.equal(written.apiKey, 'new-key', 'y 确认后应覆盖写入新 apiKey');
  const openai = written.openai as { baseUrl: string; model: string };
  assert.equal(openai.baseUrl, 'https://new/v1');
  assert.equal(openai.model, 'new-model');
});

test('init 已有配置时 n 放弃写入 → 旧配置原样保留，退出码 0', async () => {
  const dir = makeTempDir('periscope-init-decline-');
  const configPath = path.join(dir, 'config.json');
  const originalContent = JSON.stringify({ ...DEFAULT_CONFIG, apiKey: 'preserved-key' }, null, 2);
  fs.writeFileSync(configPath, originalContent);
  const stdin = ttyStdin(interactiveChunks({
    baseUrl: 'https://new/v1',
    model: 'new-model',
    apiKey: 'new-key',
    confirm: 'n\n',
  }));
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.equal(code, 0, '主动放弃不是错误，应零退出');
  assert.match(stdout.data, /已放弃|保持不变/, 'n 放弃应给出明确提示');
  const after = fs.readFileSync(configPath).toString('utf8');
  assert.equal(after, originalContent, 'n 放弃后旧配置字节不变');
  assert.match(after, /preserved-key/, '旧 apiKey 应原样保留');
});

test('init 配置写入 PERISCOPE_CONFIG 优先于 HOME 派生路径', async () => {
  const home = makeTempDir('periscope-init-homeonly-');
  const configPath = path.join(makeTempDir('periscope-init-pcc-'), 'custom.json');
  const stdin = ttyStdin(interactiveChunks({ baseUrl: 'https://x', model: 'm', apiKey: 'k' }));
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { HOME: home, PERISCOPE_CONFIG: configPath });

  assert.equal(code, 0, stderr.data);
  assert.ok(fs.existsSync(configPath), `应写入 PERISCOPE_CONFIG 路径: ${configPath}`);
  const homeDerived = path.join(home, '.config', 'periscope', 'config.json');
  assert.ok(!fs.existsSync(homeDerived), 'HOME 派生路径不应被写入');
});

test('init 未设置 PERISCOPE_CONFIG 时写入 HOME/.config/periscope/config.json', async () => {
  const home = makeTempDir('periscope-init-homeonly-');
  const expected = path.join(home, '.config', 'periscope', 'config.json');
  const stdin = ttyStdin(interactiveChunks({ baseUrl: 'https://x', model: 'm', apiKey: 'k' }));
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { HOME: home });

  assert.equal(code, 0, stderr.data);
  assert.ok(fs.existsSync(expected), `应写入 HOME 派生路径: ${expected}`);
});

test('init 输入流提前结束（EOF）→ 报错 + 非零退出，不写出配置', async () => {
  const dir = makeTempDir('periscope-init-eof-');
  const configPath = path.join(dir, 'config.json');
  const stdin = ttyStdin(['\r']);
  stdin.push(null);
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.notEqual(code, 0);
  assert.ok(stderr.data.length > 0, 'EOF 时应输出错误信息');
  assert.ok(!fs.existsSync(configPath), 'EOF 中断不应写出配置');
});

test('init 字段输入期间 Ctrl+C（raw mode 无 SIGINT）→ 中断退出 + 非零，不写出配置', async () => {
  const dir = makeTempDir('periscope-init-ctrlc-');
  const configPath = path.join(dir, 'config.json');
  const stdin = ttyStdin(['\r', '\x03']);
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.notEqual(code, 0);
  assert.ok(stderr.data.length > 0, 'Ctrl+C 中断应输出错误信息');
  assert.ok(!fs.existsSync(configPath), 'Ctrl+C 中断不应写出配置');
});

test('init 字段内方向键（转义序列）不污染输入值，字符正常累积', async () => {
  const dir = makeTempDir('periscope-init-arrowfield-');
  const configPath = path.join(dir, 'config.json');
  const stdin = ttyStdin(['\r', 'ab\x1b[Cc\r', 'm\r', 'k\r', 'y\n']);
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.equal(code, 0, stderr.data);
  const written = readWrittenConfig(configPath);
  const openai = written.openai as { baseUrl: string; model: string };
  assert.equal(openai.baseUrl, 'abc', '字段内方向键不应向值追加 "undefined"');
  assert.equal(openai.model, 'm');
});

test('init 写入的 JSON 顶层字段齐全：protocol / apiKey / openai / anthropic / responses', async () => {
  const dir = makeTempDir('periscope-init-shape-');
  const configPath = path.join(dir, 'config.json');
  const stdin = ttyStdin(interactiveChunks({
    proto: '\x1b[B\x1b[B\r',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: 'sk-r',
  }));
  const stdout = new StringWritable();
  const stderr = new StringWritable();

  const code = await runInit([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });

  assert.equal(code, 0, stderr.data);
  const written = readWrittenConfig(configPath);
  for (const key of ['protocol', 'apiKey', 'openai', 'anthropic', 'responses']) {
    assert.ok(key in written, `顶层字段 ${key} 必须存在`);
  }
});
