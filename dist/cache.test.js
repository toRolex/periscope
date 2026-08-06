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
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert"));
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const cache_1 = require("./cache");
const fixtures_1 = require("./testing/fixtures");
/** 临时设置/删除若干环境变量，测试结束自动还原。 */
function withEnv(env, fn) {
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
(0, node_test_1.test)('defaultCacheDir 默认 HOME/.cache/periscope，且可被 PERISCOPE_CACHE_DIR 覆盖', () => {
    const dir = (0, fixtures_1.makeTempDir)();
    withEnv({ PERISCOPE_CACHE_DIR: undefined, HOME: dir }, () => {
        assert.equal((0, cache_1.defaultCacheDir)(), path.join(dir, '.cache', 'periscope'));
    });
    const overridePath = path.join(dir, 'custom-cache');
    withEnv({ PERISCOPE_CACHE_DIR: overridePath }, () => {
        assert.equal((0, cache_1.defaultCacheDir)(), overridePath);
    });
});
(0, node_test_1.test)('imageCacheKey 确定性：同一图片两次计算得到相同 key', () => {
    const dir = (0, fixtures_1.makeTempDir)();
    const imagePath = (0, fixtures_1.writeFixtureImage)(dir);
    assert.equal((0, cache_1.imageCacheKey)(imagePath), (0, cache_1.imageCacheKey)(imagePath));
});
(0, node_test_1.test)('imageCacheKey 路径变化 → key 变化', () => {
    const dir = (0, fixtures_1.makeTempDir)();
    const a = (0, fixtures_1.writeFixtureImage)(dir, 'a.png');
    const b = (0, fixtures_1.writeFixtureImage)(dir, 'b.png');
    assert.notEqual((0, cache_1.imageCacheKey)(a), (0, cache_1.imageCacheKey)(b));
});
(0, node_test_1.test)('imageCacheKey 修改时间变化（大小不变）→ key 变化', () => {
    const dir = (0, fixtures_1.makeTempDir)();
    const imagePath = (0, fixtures_1.writeFixtureImage)(dir);
    const before = (0, cache_1.imageCacheKey)(imagePath);
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(imagePath, past, past);
    const after = (0, cache_1.imageCacheKey)(imagePath);
    assert.notEqual(before, after);
});
(0, node_test_1.test)('imageCacheKey 大小变化（修改时间还原）→ key 变化', () => {
    const dir = (0, fixtures_1.makeTempDir)();
    const imagePath = (0, fixtures_1.writeFixtureImage)(dir);
    const originalMtimeMs = fs.statSync(imagePath).mtimeMs;
    const before = (0, cache_1.imageCacheKey)(imagePath);
    fs.writeFileSync(imagePath, 'changed-size-content');
    fs.utimesSync(imagePath, new Date(originalMtimeMs), new Date(originalMtimeMs));
    const after = (0, cache_1.imageCacheKey)(imagePath);
    assert.notEqual(before, after);
});
(0, node_test_1.test)('writeCacheEntry 持久化 + readCacheEntry 读回；未命中返回 undefined', () => {
    const cacheDir = path.join((0, fixtures_1.makeTempDir)(), 'nested', 'cache');
    const key = 'abc123';
    assert.equal((0, cache_1.readCacheEntry)(key, cacheDir), undefined);
    (0, cache_1.writeCacheEntry)(key, '图片里有一座山', cacheDir);
    assert.equal((0, cache_1.readCacheEntry)(key, cacheDir), '图片里有一座山');
    assert.ok(fs.existsSync(path.join(cacheDir, `${key}.txt`)), '缓存条目应落盘');
});
