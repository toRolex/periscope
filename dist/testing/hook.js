"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runHook = runHook;
const node_child_process_1 = require("node:child_process");
/**
 * spawn 编译后的 hook 脚本，写入 stdin JSON，返回 stdout/stderr/退出码。
 * 入口路径由调用方传入（不同测试的编译产物位于各自目录）。
 */
function runHook(entry, stdin, env) {
    return new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(process.execPath, [entry], { env });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => {
            resolve({ stdout, stderr, code: code ?? -1 });
        });
        child.stdin.write(stdin);
        child.stdin.end();
    });
}
