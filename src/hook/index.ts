#!/usr/bin/env node
import * as fs from 'node:fs';
import { describe, DescribeOptions } from '../core/describe';

/**
 * UserPromptSubmit hook 桥接：读取 Claude Code 发送到 stdin 的事件 JSON，
 * 自动并行描述携带的图片，并把 `[Image N] basename: 描述` 注入 additionalContext。
 * 始终返回 decision=approve（放行）且带 additionalContext（无图片时为空串），
 * 单图失败注入 `描述不可用` 占位符，绝不阻塞发送。
 */

/** 单图描述结果；description 为 null 表示该图描述失败。 */
export interface DescribeResult {
  path: string;
  description: string | null;
}

/**
 * hook stdout 输出的 JSON 结构（Claude Code UserPromptSubmit 规范，2.1.x 实测 schema）。
 * decision 取 approve|block（approve 即放行）；带 hookSpecificOutput 时 additionalContext
 * 为必填，无图片时注入空串，避免 hook_non_blocking_error。
 */
export interface HookOutput {
  decision: 'approve';
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit';
    additionalContext: string;
  };
}

/** additionalContext 软预算：Claude Code 硬上限约 10k 字符，接近时截断。 */
export const DEFAULT_IMAGE_CONTEXT_BUDGET = 9000;

/** basename：本地路径与 URL 统一取最后一段；取不到时回退原串。 */
export function basenameOf(imagePath: string): string {
  const base = imagePath.split(/[\\/]/).filter(Boolean).pop();
  return base ?? imagePath;
}

/**
 * 多图并行描述，逐图容错：单图失败记 description=null，不阻塞其余。
 * 复用核心 describe()（含缓存命中与请求构造）；并行度与 describeMany 一致，
 * 差异仅在失败策略——hook 层需要"单张失败注入占位符"，而非 fail-fast。
 */
export async function describeImageEntries(
  paths: string[],
  opts: DescribeOptions = {},
): Promise<DescribeResult[]> {
  const settled = await Promise.allSettled(paths.map((p) => describe({ imagePath: p }, opts)));
  return settled.map((result, i) => ({
    path: paths[i],
    description: result.status === 'fulfilled' ? result.value : null,
  }));
}

function formatLine(n: number, result: DescribeResult): string {
  const description = result.description ?? '描述不可用';
  return `[Image ${n}] ${basenameOf(result.path)}: ${description}`;
}

/**
 * 把描述结果格式化为注入文本。逐行累计长度，接近预算时停止追加，
 * 并在末尾注明剩余未描述张数。
 */
export function buildImageContext(
  results: DescribeResult[],
  budget = DEFAULT_IMAGE_CONTEXT_BUDGET,
): string {
  const lines: string[] = [];
  let used = 0;
  let included = 0;
  for (let i = 0; i < results.length; i += 1) {
    const line = formatLine(i + 1, results[i]);
    if (used + line.length > budget) break;
    lines.push(line);
    used += line.length;
    included += 1;
  }
  const remaining = results.length - included;
  if (remaining > 0) {
    lines.push(`（另有 ${remaining} 张图片未描述）`);
  }
  return lines.join('\n');
}

/** 编排：解析 stdin 事件 → 并行描述 → 注入 additionalContext，始终放行。 */
export async function handleHookInput(
  input: unknown,
  opts: DescribeOptions = {},
): Promise<HookOutput> {
  const obj = (input ?? {}) as Record<string, unknown>;
  const rawPaths = obj.image_paths;
  const imagePaths = Array.isArray(rawPaths)
    ? rawPaths.filter((p): p is string => typeof p === 'string')
    : [];

  if (imagePaths.length === 0) {
    return {
      decision: 'approve',
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: '' },
    };
  }

  const results = await describeImageEntries(imagePaths, opts);
  const additionalContext = buildImageContext(results);
  return {
    decision: 'approve',
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext },
  };
}

function readStdin(): string {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function allowOutput(): HookOutput {
  return {
    decision: 'approve',
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: '' },
  };
}

/** 入口：读 stdin → 处理 → 输出 JSON。任何内部错误也放行（绝不 block 消息发送）。 */
export function main(): void {
  let input: unknown;
  try {
    const raw = readStdin().trim();
    input = raw ? JSON.parse(raw) : {};
  } catch {
    input = {};
  }

  handleHookInput(input).then(
    (output) => {
      process.stdout.write(JSON.stringify(output));
    },
    () => {
      process.stdout.write(JSON.stringify(allowOutput()));
    },
  );
}

if (require.main === module) {
  main();
}
