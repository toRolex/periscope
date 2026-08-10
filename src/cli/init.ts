#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { Readable, Writable } from 'node:stream';
import { DEFAULT_CONFIG, PeriscopeConfig } from '../config/config';
import { Protocol } from '../protocols/types';
import { errorMessage } from './shared';

export interface RunInitOptions {
  HOME?: string | undefined;
  PERISCOPE_CONFIG?: string | undefined;
}

const PROTOCOLS: Protocol[] = ['openai', 'anthropic', 'responses'];

function defaultConfigPathForEnv(env: RunInitOptions): string {
  return (
    env.PERISCOPE_CONFIG ??
    path.join(env.HOME ?? '', '.config', 'periscope', 'config.json')
  );
}

function nonEmptyValidator(label: string): (v: string) => string | null {
  return (v) => (v.trim().length === 0 ? `${label} 不能为空` : null);
}

function protocolValidator(): (v: string) => string | null {
  return (v) =>
    PROTOCOLS.includes(v as Protocol) ? null : `协议必须是 openai/anthropic/responses 之一`;
}

/**
 * periscope init：以选择题方式引导用户完成配置，写到默认路径。
 * 目标文件已存在 → 拒绝覆盖（避免误删 API key）。
 * stdin/stdout/stderr/env 全部可注入，便于测试直接调函数而非 fork 子进程。
 */
export async function runInit(
  _argv: string[],
  stdin: Readable,
  stdout: Writable,
  stderr: Writable,
  env: RunInitOptions,
): Promise<number> {
  const configPath = defaultConfigPathForEnv(env);

  if (fs.existsSync(configPath)) {
    stderr.write(`错误: 配置文件已存在 (${configPath})，拒绝覆盖以避免误删已有 API key\n`);
    stderr.write('提示: 如需重新生成，请先手动删除该文件再运行 periscope init\n');
    return 1;
  }

  const input = readline.createInterface({ input: stdin, crlfDelay: Infinity });
  const lines = input[Symbol.asyncIterator]();

  const ask = async (
    question: string,
    validate: (value: string) => string | null,
  ): Promise<string | null> => {
    stdout.write(question);
    const result = await lines.next();
    if (result.done) {
      stderr.write('错误: 输入流提前结束（EOF）\n');
      return null;
    }
    const line = result.value;
    const err = validate(line);
    if (err !== null) {
      stderr.write(`错误: ${err}\n`);
      return null;
    }
    return line;
  };

  const protocol = await ask(`选择协议 (openai/anthropic/responses): `, protocolValidator());
  if (protocol === null) return 1;

  const baseUrl = await ask(`${protocol} baseUrl: `, nonEmptyValidator('baseUrl'));
  if (baseUrl === null) return 1;

  const model = await ask(`${protocol} model: `, nonEmptyValidator('model'));
  if (model === null) return 1;

  const apiKey = await ask(`apiKey (可空): `, () => null);
  if (apiKey === null) return 1;

  const userProtocol = protocol as Protocol;
  const next: PeriscopeConfig = {
    ...DEFAULT_CONFIG,
    protocol: userProtocol,
    apiKey,
    openai: { ...DEFAULT_CONFIG.openai },
    anthropic: { ...DEFAULT_CONFIG.anthropic },
    responses: { ...DEFAULT_CONFIG.responses },
  };
  next[userProtocol] = { baseUrl, model };

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2) + '\n');
  stdout.write(`已写入配置: ${configPath}\n`);
  return 0;
}

if (require.main === module) {
  runInit(process.argv.slice(2), process.stdin, process.stdout, process.stderr, {
    HOME: process.env.HOME,
    PERISCOPE_CONFIG: process.env.PERISCOPE_CONFIG,
  }).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stderr.write(`错误: ${errorMessage(err)}\n`);
      process.exitCode = 1;
    },
  );
}