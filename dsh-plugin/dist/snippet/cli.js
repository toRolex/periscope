#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSnippetArgs = parseSnippetArgs;
exports.runSnippet = runSnippet;
const snippet_1 = require("./snippet");
const PROTOCOL_HINT = 'openai | anthropic | responses';
const USAGE = [
    '用法: periscope-dsh-snippet [选项]',
    '',
    '输出可粘贴进 cordis.yml 的 periscope-dsh 视觉端点配置片段（protocol / baseUrl / model',
    '占位）+ env apiKey 指引。非交互、离线。',
    '',
    '选项:',
    `  --protocol <openai|anthropic|responses>  视觉端点协议（默认 openai）`,
    `  --baseUrl <url>                          视觉端点 baseUrl（默认 ${snippet_1.DEFAULT_BASE_URL_PLACEHOLDER}）`,
    `  --model <model>                          视觉端点模型名（默认 ${snippet_1.DEFAULT_MODEL_PLACEHOLDER}）`,
    `  --apiKeyEnv <var>                        承载视觉 apiKey 的环境变量名（默认 ${snippet_1.DEFAULT_API_KEY_ENV}）`,
    '  -h, --help                               显示本帮助',
    '',
].join('\n');
/** 解析 CLI 参数：合法 → ok 选项；缺值 / 非法 protocol / 未知选项 → 错误文案。 */
function parseSnippetArgs(argv) {
    const options = {};
    let i = 0;
    while (i < argv.length) {
        const flag = argv[i];
        const value = argv[i + 1];
        switch (flag) {
            case '--protocol':
                if (value === undefined) {
                    return { ok: false, error: `缺少 --protocol 的值（应为 ${PROTOCOL_HINT}）` };
                }
                if (!snippet_1.VALID_PROTOCOLS.includes(value)) {
                    return { ok: false, error: `非法 protocol: ${value}（应为 ${PROTOCOL_HINT}）` };
                }
                options.protocol = value;
                i += 2;
                break;
            case '--baseUrl':
                if (value === undefined)
                    return { ok: false, error: '缺少 --baseUrl 的值' };
                options.baseUrl = value;
                i += 2;
                break;
            case '--model':
                if (value === undefined)
                    return { ok: false, error: '缺少 --model 的值' };
                options.model = value;
                i += 2;
                break;
            case '--apiKeyEnv':
                if (value === undefined)
                    return { ok: false, error: '缺少 --apiKeyEnv 的值' };
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
function hasHelpFlag(argv) {
    return argv.includes('-h') || argv.includes('--help');
}
/**
 * 运行片段生成器：--help 输出用法退出 0；参数错误向 stderr 报错退出 1；
 * 成功把片段写到 stdout 退出 0。不触碰 stdin，无 TTY 依赖。
 */
function runSnippet(argv, stdout, stderr) {
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
        stdout.write((0, snippet_1.generateSnippet)(parsed.options));
    }
    catch (err) {
        stderr.write(`错误: ${err instanceof Error ? err.message : String(err)}\n`);
        return 1;
    }
    return 0;
}
if (require.main === module) {
    process.exitCode = runSnippet(process.argv.slice(2), process.stdout, process.stderr);
}
