import type { Writable } from 'node:stream';
import { describeMany } from '../core/describe';
import { errorMessage } from './shared';

export interface ParsedArgs {
  imagePaths: string[];
  intent?: string;
}

export function parseDescribeArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { imagePaths: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--intent') {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error('--intent 需要一个参数值');
      }
      parsed.intent = value;
      i += 1;
    } else if (arg.startsWith('--')) {
      throw new Error(`未知参数: ${arg}`);
    } else {
      parsed.imagePaths.push(arg);
    }
  }
  return parsed;
}

export function describeUsage(): string {
  return '用法: periscope describe <图片路径或URL> [...] [--intent "描述内容"]';
}

/**
 * `periscope describe` 命令：解析参数 → 调核心 → 描述输出到 stdout，报错走 stderr + 非零退出码。
 * stdout/stderr 可注入，便于测试直接调用。
 */
export async function runDescribe(
  argv: string[],
  stdout: Writable,
  stderr: Writable,
): Promise<number> {
  let parsed: ParsedArgs;
  try {
    parsed = parseDescribeArgs(argv);
  } catch (err) {
    stderr.write(`错误: ${errorMessage(err)}\n`);
    stderr.write(`${describeUsage()}\n`);
    return 1;
  }

  if (parsed.imagePaths.length === 0) {
    stderr.write('错误: 缺少图片路径\n');
    stderr.write(`${describeUsage()}\n`);
    return 1;
  }

  try {
    const inputs = parsed.imagePaths.map((imagePath) => ({
      imagePath,
      intent: parsed.intent,
    }));
    const outcomes = await describeMany(inputs);
    if (outcomes.length === 1) {
      const only = outcomes[0];
      if (only.description !== null) {
        stdout.write(`${only.description}\n`);
        return 0;
      }
      stderr.write(`错误: ${only.error ?? '描述失败'}\n`);
      return 1;
    }
    let code = 0;
    for (const outcome of outcomes) {
      if (outcome.description !== null) {
        stdout.write(`${outcome.source}: ${outcome.description}\n`);
      } else {
        stderr.write(`${outcome.source}: ${outcome.error ?? '描述失败'}\n`);
        code = 1;
      }
    }
    return code;
  } catch (err) {
    stderr.write(`错误: ${errorMessage(err)}\n`);
    return 1;
  }
}