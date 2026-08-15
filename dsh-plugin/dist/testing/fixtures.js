import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DEFAULT_CONFIG } from '../config/config.js';
/**
 * 测试件（从主仓 src/testing/fixtures.ts 拷贝并精简到本包用到的 helper，
 * 保持 mock 视觉端点 seam 一致——全程离线，无需真实 API key）。
 */
/** 1x1 透明 PNG（base64）。mock 端点不校验图片内容，用于测试图片字节 → data URL 构造。 */
export const PNG_1PX_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
export function makeTempDir(prefix = 'periscope-dsh-test-') {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
/** 在 dir 下写入一份 periscope 配置文件，返回路径与配置对象。 */
export function writeConfigFile(dir, overrides = {}) {
    const config = { ...DEFAULT_CONFIG, ...overrides };
    const filePath = path.join(dir, 'config.json');
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    return { path: filePath, config };
}
/** 测试用就绪端点（baseUrl 由调用方注入，如 mock server 动态端口；model 固定）。 */
export function readyEndpoint(baseUrl) {
    return { baseUrl, model: 'vision-model' };
}
/** 临时设置/删除若干环境变量，测试结束自动还原。 */
export function withEnv(env, fn) {
    const saved = new Map();
    for (const key of Object.keys(env)) {
        saved.set(key, process.env[key]);
        if (env[key] === undefined) {
            delete process.env[key];
        }
        else {
            process.env[key] = env[key];
        }
    }
    try {
        fn();
    }
    finally {
        for (const [key, value] of saved) {
            if (value === undefined) {
                delete process.env[key];
            }
            else {
                process.env[key] = value;
            }
        }
    }
}
