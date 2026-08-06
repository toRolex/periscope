#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_IMAGE_CONTEXT_BUDGET = void 0;
exports.basenameOf = basenameOf;
exports.describeImageEntries = describeImageEntries;
exports.buildImageContext = buildImageContext;
exports.handleHookInput = handleHookInput;
exports.main = main;
const fs = __importStar(require("node:fs"));
const describe_1 = require("../core/describe");
/** additionalContext 软预算：Claude Code 硬上限约 10k 字符，接近时截断。 */
exports.DEFAULT_IMAGE_CONTEXT_BUDGET = 9000;
/** basename：本地路径与 URL 统一取最后一段；取不到时回退原串。 */
function basenameOf(imagePath) {
    const base = imagePath.split(/[\\/]/).filter(Boolean).pop();
    return base ?? imagePath;
}
/**
 * 多图并行描述，逐图容错：单图失败记 description=null，不阻塞其余。
 * 复用核心 describe()（含缓存命中与请求构造）；并行度与 describeMany 一致，
 * 差异仅在失败策略——hook 层需要"单张失败注入占位符"，而非 fail-fast。
 */
async function describeImageEntries(paths, opts = {}) {
    const settled = await Promise.allSettled(paths.map((p) => (0, describe_1.describe)({ imagePath: p }, opts)));
    return settled.map((result, i) => ({
        path: paths[i],
        description: result.status === 'fulfilled' ? result.value : null,
    }));
}
function formatLine(n, result) {
    const description = result.description ?? '描述不可用';
    return `[Image ${n}] ${basenameOf(result.path)}: ${description}`;
}
/**
 * 把描述结果格式化为注入文本。逐行累计长度，接近预算时停止追加，
 * 并在末尾注明剩余未描述张数。
 */
function buildImageContext(results, budget = exports.DEFAULT_IMAGE_CONTEXT_BUDGET) {
    const lines = [];
    let used = 0;
    let included = 0;
    for (let i = 0; i < results.length; i += 1) {
        const line = formatLine(i + 1, results[i]);
        if (used + line.length > budget)
            break;
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
async function handleHookInput(input, opts = {}) {
    const obj = (input ?? {});
    const rawPaths = obj.image_paths;
    const imagePaths = Array.isArray(rawPaths)
        ? rawPaths.filter((p) => typeof p === 'string')
        : [];
    if (imagePaths.length === 0) {
        return { decision: 'allow', hookSpecificOutput: { hookEventName: 'UserPromptSubmit' } };
    }
    const results = await describeImageEntries(imagePaths, opts);
    const additionalContext = buildImageContext(results);
    return {
        decision: 'allow',
        hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext },
    };
}
function readStdin() {
    try {
        return fs.readFileSync(0, 'utf8');
    }
    catch {
        return '';
    }
}
function allowOutput() {
    return { decision: 'allow', hookSpecificOutput: { hookEventName: 'UserPromptSubmit' } };
}
/** 入口：读 stdin → 处理 → 输出 JSON。任何内部错误也放行（绝不 block 消息发送）。 */
function main() {
    let input;
    try {
        const raw = readStdin().trim();
        input = raw ? JSON.parse(raw) : {};
    }
    catch {
        input = {};
    }
    handleHookInput(input).then((output) => {
        process.stdout.write(JSON.stringify(output));
    }, () => {
        process.stdout.write(JSON.stringify(allowOutput()));
    });
}
if (require.main === module) {
    main();
}
