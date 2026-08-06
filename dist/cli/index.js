#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const describe_1 = require("../core/describe");
function parseArgs(argv) {
    const parsed = { imagePaths: [] };
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
        else {
            parsed.imagePaths.push(arg);
        }
    }
    return parsed;
}
function usage() {
    return '用法: periscope describe <图片路径或URL> [...] [--intent "描述内容"]';
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
        const outcomes = await (0, describe_1.describeMany)(inputs);
        if (outcomes.length === 1) {
            const only = outcomes[0];
            if (only.description !== null) {
                process.stdout.write(`${only.description}\n`);
                return 0;
            }
            process.stderr.write(`错误: ${only.error ?? '描述失败'}\n`);
            return 1;
        }
        let code = 0;
        for (const outcome of outcomes) {
            if (outcome.description !== null) {
                process.stdout.write(`${outcome.source}: ${outcome.description}\n`);
            }
            else {
                process.stderr.write(`${outcome.source}: ${outcome.error ?? '描述失败'}\n`);
                code = 1;
            }
        }
        return code;
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
