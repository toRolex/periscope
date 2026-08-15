#!/usr/bin/env node
import type { Writable } from 'node:stream';
import { Protocol } from '../protocols/types';
import {
  DEFAULT_API_KEY_ENV,
  DEFAULT_BASE_URL_PLACEHOLDER,
  DEFAULT_MODEL_PLACEHOLDER,
  generateSnippet,
  SnippetOptions,
  VALID_PROTOCOLS,
} from './snippet';

/**
 * periscope-dsh 的 cordis.yml 片段生成 CLI（issue #30）。
 *
 * 非交互、离线：不读 stdin、不发请求，运行即输出可粘贴的配置片段。
 * 用法示例：
 *   node dist/snippet/cli.js --protocol responses --baseUrl http://localhost:11434/v1 --model llava
 * 缺省输出占位片段（protocol openai + 占位 baseUrl/model），用户自行替换后粘贴进 cordis.yml。
 * 本脚本是 Claude Code 侧 init wizard 的 dsh 侧降级形态（双宿主并存，互不影响）。
 */

export type ParsedSnippetArgs =
  | { ok: true; options: SnippetOptions }
  | { ok: false; error: string };

const PROTOCOL_HINT = 'openai | anthropic | responses';

const USAGE = [
  '用法: periscope-dsh-snippet [选项]',
  '',
  '输出可粘贴进 cordis.yml 的 periscope-dsh 视觉端点配置片段（protocol / baseUrl / model',
  '占位）+ env apiKey 指引。非交互、离线。',
  '',
  '选项:',
  `  --protocol <openai|anthropic|responses>  视觉端点协议（默认 openai）`,
  `  --baseUrl <url>                          视觉端点 baseUrl（默认 ${DEFAULT_BASE_URL_PLACEHOLDER}）`,
  `  --model <model>                          视觉端点模型名（默认 ${DEFAULT_MODEL_PLACEHOLDER}）`,
  `  --apiKeyEnv <var>                        承载视觉 apiKey 的环境变量名（默认 ${DEFAULT_API_KEY_ENV}）`,
  '  -h, --help                               显示本帮助',
  '',
].join('\n');

/** 解析 CLI 参数：合法 → ok 选项；缺值 / 非法 protocol / 未知选项 → 错误文案。 */
export function parseSnippetArgs(argv: string[]): ParsedSnippetArgs {
  const options: SnippetOptions = {};
  let i = 0;
  while (i < argv.length) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case '--protocol':
        if (value === undefined) {
          return { ok: false, error: `缺少 --protocol 的值（应为 ${PROTOCOL_HINT}）` };
        }
        if (!VALID_PROTOCOLS.includes(value as Protocol)) {
          return { ok: false, error: `非法 protocol: ${value}（应为 ${PROTOCOL_HINT}）` };
        }
        options.protocol = value as Protocol;
        i += 2;
        break;
      case '--baseUrl':
        if (value === undefined) return { ok: false, error: '缺少 --baseUrl 的值' };
        options.baseUrl = value;
        i += 2;
        break;
      case '--model':
        if (value === undefined) return { ok: false, error: '缺少 --model 的值' };
        options.model = value;
        i += 2;
        break;
      case '--apiKeyEnv':
        if (value === undefined) return { ok: false, error: '缺少 --apiKeyEnv 的值' };
        options.apiKeyEnv = value;
        i += 2;
        break;
      default:
        return { ok: false, error: `未知选项: ${flag}` };
    }
  }
  return { ok: true, options };
}

/** 是否存在帮助旗标（位置无关）。 */
function hasHelpFlag(argv: string[]): boolean {
  return argv.includes('-h') || argv.includes('--help');
}

/**
 * 运行片段生成器：--help 输出用法退出 0；参数错误向 stderr 报错退出 1；
 * 成功把片段写到 stdout 退出 0。不触碰 stdin，无 TTY 依赖。
 */
export function runSnippet(argv: string[], stdout: Writable, stderr: Writable): number {
  if (hasHelpFlag(argv)) {
    stdout.write(USAGE);
    return 0;
  }
  const parsed = parseSnippetArgs(argv);
  if (!parsed.ok) {
    stderr.write(`错误: ${parsed.error}\n`);
    return 1;
  }
  try {
    stdout.write(generateSnippet(parsed.options));
  } catch (err) {
    stderr.write(`错误: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
  return 0;
}

if (require.main === module) {
  process.exitCode = runSnippet(process.argv.slice(2), process.stdout, process.stderr);
}
