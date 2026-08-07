#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const describe_1 = require("./describe");
const init_1 = require("./init");
const doctor_1 = require("./doctor");
const shared_1 = require("./shared");
function usage() {
    return '用法: periscope <command> [args]\n  describe <图片...> [--intent "..."]\n  init\n  doctor [--offline]';
}
/**
 * CLI 多命令 dispatch 入口：
 * - `describe`：原有 describe 行为（多图 / URL / --intent）
 * - `init`：交互式选择题写配置（拒绝已存在文件）
 * - `doctor`：本地自检（v1.1 实现，见 #12 + #13；--offline 跳过任何 schema 网络拉取）
 */
async function main(argv, stdin = process.stdin, stdout = process.stdout, stderr = process.stderr) {
    const command = argv[0];
    switch (command) {
        case 'describe':
            return (0, describe_1.runDescribe)(argv.slice(1), stdout, stderr);
        case 'init':
            return (0, init_1.runInit)(argv.slice(1), stdin, stdout, stderr, {
                HOME: process.env.HOME,
                PERISCOPE_CONFIG: process.env.PERISCOPE_CONFIG,
            });
        case 'doctor':
            return (0, doctor_1.runDoctor)(argv.slice(1), stdout, stderr, {
                HOME: process.env.HOME,
                PERISCOPE_CONFIG: process.env.PERISCOPE_CONFIG,
                nodeVersion: process.version,
            });
        default: {
            stderr.write(`${usage()}\n`);
            return 1;
        }
    }
}
if (require.main === module) {
    main(process.argv.slice(2)).then((code) => {
        process.exitCode = code;
    }, (err) => {
        process.stderr.write(`错误: ${(0, shared_1.errorMessage)(err)}\n`);
        process.exitCode = 1;
    });
}
