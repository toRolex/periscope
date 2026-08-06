#!/usr/bin/env node
import { describeMany } from '../core/describe';

interface ParsedArgs {
  imagePaths: string[];
  intent?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
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

function usage(): string {
  return '用法: periscope describe <图片路径或URL> [...] [--intent "描述内容"]';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** CLI 入口：解析参数 → 调核心 → 描述输出到 stdout，报错走 stderr + 非零退出码。 */
export async function main(argv: string[]): Promise<number> {
  const command = argv[0];
  if (command !== 'describe') {
    process.stderr.write(`${usage()}\n`);
    return 1;
  }

  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(argv.slice(1));
  } catch (err) {
    process.stderr.write(`错误: ${errorMessage(err)}\n`);
    process.stderr.write(`${usage()}\n`);
    return 1;
  }

  if (parsed.imagePaths.length === 0) {
    process.stderr.write('错误: 缺少图片路径\n');
    process.stderr.write(`${usage()}\n`);
    return 1;
  }

  try {
    const inputs = parsed.imagePaths.map((imagePath) => ({
      imagePath,
      intent: parsed.intent,
    }));
    const texts = await describeMany(inputs);
    if (texts.length === 1) {
      process.stdout.write(`${texts[0]}\n`);
    } else {
      for (let i = 0; i < texts.length; i += 1) {
        process.stdout.write(`${parsed.imagePaths[i]}: ${texts[i]}\n`);
      }
    }
    return 0;
  } catch (err) {
    process.stderr.write(`错误: ${errorMessage(err)}\n`);
    return 1;
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stderr.write(`错误: ${errorMessage(err)}\n`);
      process.exitCode = 1;
    },
  );
}
