#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const describe_1 = require("../core/describe");
function parseArgs(argv) {
    const parsed = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--intent') {
            const value = argv[i + 1];
            if (value === undefined) {
                throw new Error('--intent 需要一个参数值');
            }
            parsed.intent = value;
            i += 1;
        }
        else if (arg.startsWith('--')) {
            throw new Error(`未知参数: ${arg}`);
        }
        else if (parsed.imagePath === undefined) {
            parsed.imagePath = arg;
        }
        else {
            throw new Error(`多余的参数: ${arg}`);
        }
    }
    return parsed;
}
function usage() {
    return '用法: periscope describe <图片路径> [--intent "描述内容"]';
}
function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
/** CLI 入口：解析参数 → 调核心 → 描述输出到 stdout，报错走 stderr + 非零退出码。 */
async function main(argv) {
    const command = argv[0];
    if (command !== 'describe') {
        process.stderr.write(`${usage()}\n`);
        return 1;
    }
    let parsed;
    try {
        parsed = parseArgs(argv.slice(1));
    }
    catch (err) {
        process.stderr.write(`错误: ${errorMessage(err)}\n`);
        process.stderr.write(`${usage()}\n`);
        return 1;
    }
    if (!parsed.imagePath) {
        process.stderr.write('错误: 缺少图片路径\n');
        process.stderr.write(`${usage()}\n`);
        return 1;
    }
    try {
        const text = await (0, describe_1.describe)({ imagePath: parsed.imagePath, intent: parsed.intent });
        process.stdout.write(`${text}\n`);
        return 0;
    }
    catch (err) {
        process.stderr.write(`错误: ${errorMessage(err)}\n`);
        return 1;
    }
}
if (require.main === module) {
    main(process.argv.slice(2)).then((code) => {
        process.exitCode = code;
    }, (err) => {
        process.stderr.write(`错误: ${errorMessage(err)}\n`);
        process.exitCode = 1;
    });
}
