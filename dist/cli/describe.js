#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDescribeArgs = parseDescribeArgs;
exports.describeUsage = describeUsage;
exports.runDescribe = runDescribe;
const describe_1 = require("../core/describe");
const shared_1 = require("./shared");
function parseDescribeArgs(argv) {
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
function describeUsage() {
    return '用法: describe.js <图片路径或URL> [...] [--intent ocr|table|chart|"描述内容"]';
}
/**
 * describe 独立脚本：解析参数 → 调核心 → 描述输出到 stdout，报错走 stderr + 非零退出码。
 * stdout/stderr 可注入，便于测试直接调用。
 */
async function runDescribe(argv, stdout, stderr) {
    let parsed;
    try {
        parsed = parseDescribeArgs(argv);
    }
    catch (err) {
        stderr.write(`错误: ${(0, shared_1.errorMessage)(err)}\n`);
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
        const outcomes = await (0, describe_1.describeMany)(inputs);
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
            }
            else {
                stderr.write(`${outcome.source}: ${outcome.error ?? '描述失败'}\n`);
                code = 1;
            }
        }
        return code;
    }
    catch (err) {
        stderr.write(`错误: ${(0, shared_1.errorMessage)(err)}\n`);
        return 1;
    }
}
if (require.main === module) {
    runDescribe(process.argv.slice(2), process.stdout, process.stderr).then((code) => {
        process.exitCode = code;
    }, (err) => {
        process.stderr.write(`错误: ${(0, shared_1.errorMessage)(err)}\n`);
        process.exitCode = 1;
    });
}
