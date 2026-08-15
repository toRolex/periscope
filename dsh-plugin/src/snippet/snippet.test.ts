import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_API_KEY_ENV,
  DEFAULT_BASE_URL_PLACEHOLDER,
  DEFAULT_MODEL_PLACEHOLDER,
  DEFAULT_PROTOCOL,
  generateSnippet,
  yamlQuote,
} from './snippet.js';
import { parseSnippetArgs, runSnippet } from './cli.js';

/** ESM 下 __dirname 等价物（经 import.meta.url 派生）。 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { Protocol } from '../protocols/types.js';

/**
 * issue #30：dsh 侧便利脚本降级为 cordis.yml 片段生成器。
 * 断言「输出合法（可被 cordis.yml 解析的 YAML 结构）+ env apiKey 指引」，全程离线、非交互。
 */

/** 双引号 YAML 标量还原（仅测试辅助：本生成器只产出纯标量或双引号标量）。 */
function unquoteScalar(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    return raw
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  return raw;
}

/**
 * 最小 YAML 块解析：本生成器只产出单键 `config:` 映射（注释/空行跳过）。
 * 非预期行抛错——等价于「片段不可被 YAML 解析」的失败信号。
 */
function parseSnippetYaml(snippet: string): { config: Record<string, string> } {
  const config: Record<string, string> = {};
  let inConfig = false;
  for (const raw of snippet.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '' || /^\s*#/.test(line)) continue;
    if (/^config:\s*$/.test(line)) {
      inConfig = true;
      continue;
    }
    if (inConfig) {
      const m = /^  ([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
      if (m === null) throw new Error(`意外的非 config 字段行: ${JSON.stringify(line)}`);
      config[m[1]] = unquoteScalar(m[2]);
    }
  }
  if (Object.keys(config).length === 0) throw new Error('未找到可解析的 config 块');
  return { config };
}

function collectOut(): { stream: Writable; text: () => string } {
  let buf = '';
  const stream = new Writable({
    write(chunk, _enc, cb) {
      buf += chunk.toString();
      cb();
    },
  });
  return { stream, text: () => buf };
}

test('默认输出：config 段为合法 YAML，四字段齐全，协议占位合法', () => {
  const { config } = parseSnippetYaml(generateSnippet());
  assert.deepEqual(Object.keys(config).sort(), [
    'apiKeyEnv',
    'baseUrl',
    'model',
    'protocol',
  ]);
  assert.ok(
    ['openai', 'anthropic', 'responses'].includes(config.protocol),
    `protocol 占位应为 openai|anthropic|responses，实得 ${config.protocol}`,
  );
  assert.equal(config.protocol, DEFAULT_PROTOCOL);
});

test('默认占位清晰：baseUrl/model 为占位值（非空串），apiKeyEnv 为 PERISCOPE_API_KEY', () => {
  const { config } = parseSnippetYaml(generateSnippet());
  assert.equal(config.baseUrl, DEFAULT_BASE_URL_PLACEHOLDER);
  assert.equal(config.model, DEFAULT_MODEL_PLACEHOLDER);
  assert.equal(config.apiKeyEnv, DEFAULT_API_KEY_ENV);
  assert.ok(config.baseUrl.includes('your-'), 'baseUrl 应为用户替换占位');
  assert.ok(config.model.includes('your-'), 'model 应为用户替换占位');
});

test('输出含 env apiKey 指引：提及 apiKeyEnv / PERISCOPE_API_KEY / export / 占位 key', () => {
  const out = generateSnippet();
  assert.match(out, /apiKeyEnv/);
  assert.match(out, /PERISCOPE_API_KEY/);
  assert.match(out, /export\s+PERISCOPE_API_KEY=sk-your-vision-key/);
  assert.match(out, /仅从环境变量读取/);
  const skOccurrences = (out.match(/sk-/g) ?? []).length;
  assert.equal(skOccurrences, 1, '输出只应含占位 key（sk-your-vision-key），不应出现任何真实 key');
});

test('可注入 protocol/baseUrl/model/apiKeyEnv：生成对应配置值', () => {
  const { config } = parseSnippetYaml(
    generateSnippet({
      protocol: 'responses',
      baseUrl: 'http://localhost:11434/v1',
      model: 'llava',
      apiKeyEnv: 'MY_VISION_KEY',
    }),
  );
  assert.equal(config.protocol, 'responses');
  assert.equal(config.baseUrl, 'http://localhost:11434/v1');
  assert.equal(config.model, 'llava');
  assert.equal(config.apiKeyEnv, 'MY_VISION_KEY');
});

test('三协议均可注入，生成片段 protocol 取值合法', () => {
  for (const protocol of ['openai', 'anthropic', 'responses'] as Protocol[]) {
    const { config } = parseSnippetYaml(generateSnippet({ protocol }));
    assert.equal(config.protocol, protocol);
  }
});

test('非法 protocol 抛错（fail-fast）', () => {
  assert.throws(() => generateSnippet({ protocol: 'bogus' as Protocol }), /非法 protocol/);
});

test('baseUrl/model 含 YAML 特殊字符时仍合法：需要处双引号包裹', () => {
  const { config } = parseSnippetYaml(
    generateSnippet({
      baseUrl: 'https://host:8080/path',
      model: 'model with: spaces # and comment',
    }),
  );
  assert.equal(config.baseUrl, 'https://host:8080/path');
  assert.equal(config.model, 'model with: spaces # and comment');
});

test('输出整体是单键映射文档（config 为唯一顶层键），可整段作为 YAML 解析', () => {
  const snippet = generateSnippet();
  const nonCommentLines = snippet
    .split('\n')
    .filter((l) => l.trim() !== '' && !/^\s*#/.test(l));
  assert.deepEqual(
    nonCommentLines,
    [
      'config:',
      '  protocol: openai',
      '  baseUrl: https://your-vision-endpoint.example.com/v1',
      '  model: your-vision-model',
      '  apiKeyEnv: PERISCOPE_API_KEY',
    ],
    '输出非注释行应恰为 config 映射块',
  );
});

test('确定性：同参数多次生成输出一致（离线、无副作用）', () => {
  const a = generateSnippet({ protocol: 'anthropic' });
  const b = generateSnippet({ protocol: 'anthropic' });
  assert.equal(a, b);
});

// ── yamlQuote 纯函数（YAML 标量安全渲染）──

test('yamlQuote：纯标量原样、需要处双引号包裹', () => {
  assert.equal(yamlQuote('plain'), 'plain');
  assert.equal(yamlQuote('https://x/v1'), 'https://x/v1', 'URL 内冒号后非空格，可裸写');
  assert.equal(yamlQuote(''), '""');
  assert.equal(yamlQuote('#hash'), '"#hash"');
  assert.equal(yamlQuote('a: b'), '"a: b"');
  assert.equal(yamlQuote('true'), '"true"');
  assert.equal(yamlQuote('123'), '"123"');
  assert.equal(yamlQuote('has "quote"'), 'has "quote"', 'YAML 纯标量允许内含双引号，无需包裹');
  assert.equal(yamlQuote('"lead'), '"\\"lead"', '起始双引号歧义 → 双引号包裹');
  assert.equal(yamlQuote('-dash'), '"-dash"');
});

// ── CLI 参数解析（非交互）──

test('parseSnippetArgs：--protocol/--baseUrl/--model/--apiKeyEnv 解析为选项', () => {
  const parsed = parseSnippetArgs([
    '--protocol',
    'anthropic',
    '--baseUrl',
    'https://vision.example.com/v1',
    '--model',
    'vision-model',
    '--apiKeyEnv',
    'VISION_KEY',
  ]);
  assert.ok(parsed.ok);
  if (parsed.ok) {
    assert.equal(parsed.options.protocol, 'anthropic');
    assert.equal(parsed.options.baseUrl, 'https://vision.example.com/v1');
    assert.equal(parsed.options.model, 'vision-model');
    assert.equal(parsed.options.apiKeyEnv, 'VISION_KEY');
  }
});

test('parseSnippetArgs：非法 protocol 与未知选项报错', () => {
  const badProtocol = parseSnippetArgs(['--protocol', 'bogus']);
  assert.ok(!badProtocol.ok);
  const unknown = parseSnippetArgs(['--nope']);
  assert.ok(!unknown.ok);
  const missingValue = parseSnippetArgs(['--model']);
  assert.ok(!missingValue.ok);
});

test('runSnippet：默认参数输出片段到 stdout，退出码 0（不读 stdin、无 TTY 依赖）', () => {
  const out = collectOut();
  const err = collectOut();
  const code = runSnippet([], out.stream, err.stream);
  assert.equal(code, 0);
  const { config } = parseSnippetYaml(out.text());
  assert.equal(config.protocol, 'openai');
  assert.equal(err.text(), '', '默认路径不应向 stderr 写内容');
});

test('runSnippet：--protocol responses 输出对应片段', () => {
  const out = collectOut();
  const err = collectOut();
  const code = runSnippet(['--protocol', 'responses'], out.stream, err.stream);
  assert.equal(code, 0);
  const { config } = parseSnippetYaml(out.text());
  assert.equal(config.protocol, 'responses');
});

test('runSnippet：非法参数向 stderr 报错、退出码 1', () => {
  const out = collectOut();
  const err = collectOut();
  const code = runSnippet(['--protocol', 'bogus'], out.stream, err.stream);
  assert.equal(code, 1);
  assert.match(err.text(), /非法 protocol/);
  assert.equal(out.text(), '', '出错时不应向 stdout 输出片段');
});

test('runSnippet：--help 输出用法、退出码 0', () => {
  const out = collectOut();
  const err = collectOut();
  assert.equal(runSnippet(['--help'], out.stream, err.stream), 0);
  assert.match(out.text(), /用法/);
  assert.match(out.text(), /--apiKeyEnv/);
});

test('集成：编译产物 dist/snippet/cli.js 可直接以 node 运行（非交互、离线）', () => {
  const cliPath = path.join(__dirname, 'cli.js');
  assert.ok(fs.existsSync(cliPath), `cli 编译产物应存在: ${cliPath}`);
  const stdout = execFileSync(process.execPath, [cliPath, '--protocol', 'anthropic'], {
    encoding: 'utf8',
  });
  const { config } = parseSnippetYaml(stdout);
  assert.equal(config.protocol, 'anthropic');
  assert.match(stdout, /PERISCOPE_API_KEY/);
  assert.throws(
    () => execFileSync(process.execPath, [cliPath, '--protocol', 'nope'], { encoding: 'utf8' }),
    /非法 protocol/,
    '非法参数应非零退出',
  );
});
