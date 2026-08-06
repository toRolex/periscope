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
exports.defaultCacheDir = defaultCacheDir;
exports.imageCacheKey = imageCacheKey;
exports.readCacheEntry = readCacheEntry;
exports.writeCacheEntry = writeCacheEntry;
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const crypto = __importStar(require("node:crypto"));
/** 缓存目录：PERISCOPE_CACHE_DIR 优先，默认 ~/.cache/periscope。 */
function defaultCacheDir() {
    return (process.env.PERISCOPE_CACHE_DIR ??
        path.join(os.homedir(), '.cache', 'periscope'));
}
/**
 * 图片描述缓存 key：绝对路径 + 修改时间 + 大小 + 意图 → sha256 哈希。
 * 图片变化（路径 / 修改时间 / 大小任一变化）或意图不同 key 即变，从而自动失效；
 * 同图同意图复用缓存，同图不同意图视为不同 key 重新请求。
 */
function imageCacheKey(imagePath, intent = '') {
    const resolved = path.resolve(imagePath);
    let stat;
    try {
        stat = fs.statSync(resolved);
    }
    catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`无法读取图片文件: ${resolved}（${reason}）`);
    }
    const seed = `${resolved}\n${stat.mtimeMs}\n${stat.size}\n${intent}`;
    return crypto.createHash('sha256').update(seed).digest('hex');
}
function entryPath(cacheDir, key) {
    return path.join(cacheDir, `${key}.txt`);
}
/** 读取缓存条目；未命中返回 undefined。 */
function readCacheEntry(key, cacheDir) {
    const filePath = entryPath(cacheDir, key);
    if (!fs.existsSync(filePath))
        return undefined;
    return fs.readFileSync(filePath).toString('utf8');
}
/** 写入缓存条目（目录不存在时递归创建）。 */
function writeCacheEntry(key, value, cacheDir) {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(entryPath(cacheDir, key), value);
}
