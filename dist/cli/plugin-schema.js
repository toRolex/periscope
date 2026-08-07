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
exports.SCHEMA_CACHE_FILENAME = exports.SCHEMA_TTL_MS = exports.PLUGIN_SCHEMA_URL = void 0;
exports.pluginSchemaCachePath = pluginSchemaCachePath;
exports.isSchemaCacheFresh = isSchemaCacheFresh;
exports.validatePluginManifest = validatePluginManifest;
exports.loadPluginSchema = loadPluginSchema;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
/** Agent Plugins 1.0.0 根 plugin.json schema 的规范 URL。 */
exports.PLUGIN_SCHEMA_URL = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
/** schema 缓存有效期：7 天（mtime 距今 < TTL 视为新鲜）。 */
exports.SCHEMA_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** 缓存文件名（存于缓存目录下，与图片缓存同目录不同名）。 */
exports.SCHEMA_CACHE_FILENAME = 'agent-plugins.schema.json';
/** schema 缓存文件的绝对路径。 */
function pluginSchemaCachePath(cacheDir) {
    return path.join(cacheDir, exports.SCHEMA_CACHE_FILENAME);
}
/** 缓存是否新鲜：文件存在且 mtime 距今 < TTL。 */
function isSchemaCacheFresh(cachePath, now = Date.now(), ttlMs = exports.SCHEMA_TTL_MS) {
    try {
        return now - fs.statSync(cachePath).mtimeMs < ttlMs;
    }
    catch {
        return false;
    }
}
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function typeMatches(value, type) {
    switch (type) {
        case 'string':
            return typeof value === 'string';
        case 'number':
            return typeof value === 'number' && Number.isFinite(value);
        case 'boolean':
            return typeof value === 'boolean';
        case 'object':
            return isObject(value);
        case 'array':
            return Array.isArray(value);
        case 'null':
            return value === null;
        default:
            return true; // 未知类型不做约束
    }
}
function constMatches(value, expected) {
    return JSON.stringify(value) === JSON.stringify(expected);
}
/**
 * 递归校验一个节点：按 schema 的约束子集（type / const / required / properties /
 * additionalProperties / minLength / maxLength / pattern / items）检查，把错误推入 errors。
 * path 形如 `$`、`$.name`、`$.author.email`、`$.keywords[0]`，用于不合规时的来源提示。
 */
function validateNode(node, schema, nodePath, errors) {
    if (schema.const !== undefined && !constMatches(node, schema.const)) {
        errors.push(`${nodePath}: 必须等于 ${JSON.stringify(schema.const)}`);
        return;
    }
    if (typeof schema.type === 'string') {
        if (!typeMatches(node, schema.type)) {
            errors.push(`${nodePath}: 类型应为 ${schema.type}，实际为 ${Array.isArray(node) ? 'array' : typeof node}`);
            return;
        }
    }
    if (typeof node === 'string') {
        if (typeof schema.minLength === 'number' && node.length < schema.minLength) {
            errors.push(`${nodePath}: 长度小于 minLength ${schema.minLength}`);
        }
        if (typeof schema.maxLength === 'number' && node.length > schema.maxLength) {
            errors.push(`${nodePath}: 长度大于 maxLength ${schema.maxLength}`);
        }
        if (typeof schema.pattern === 'string') {
            try {
                if (!new RegExp(schema.pattern).test(node)) {
                    errors.push(`${nodePath}: 不符合 pattern ${schema.pattern}`);
                }
            }
            catch {
                // schema 携带非法正则时不硬失败，跳过该约束
            }
        }
    }
    if (Array.isArray(node) && isObject(schema.items)) {
        node.forEach((item, index) => {
            validateNode(item, schema.items, `${nodePath}[${index}]`, errors);
        });
        return;
    }
    if (isObject(node)) {
        const properties = isObject(schema.properties)
            ? schema.properties
            : {};
        for (const key of Object.keys(node)) {
            if (key in properties) {
                validateNode(node[key], properties[key], `${nodePath}.${key}`, errors);
            }
            else if (schema.additionalProperties === false) {
                errors.push(`${nodePath}.${key}: 不允许的字段`);
            }
            else if (isObject(schema.additionalProperties)) {
                validateNode(node[key], schema.additionalProperties, `${nodePath}.${key}`, errors);
            }
        }
        if (Array.isArray(schema.required)) {
            for (const required of schema.required) {
                if (typeof required === 'string' && !(required in node)) {
                    errors.push(`${nodePath}: 缺少必填字段 ${required}`);
                }
            }
        }
    }
}
/**
 * 手写 JSON Schema 约束解释器（不引入 ajv，保持零运行时依赖）：
 * 按下载的 schema 的约束子集校验 Agent Plugins 1.0.0 根 plugin.json manifest。
 * 返回错误信息数组；空数组 = 合规。每条错误带 JSON path，供「来源提示」使用。
 */
function validatePluginManifest(manifest, schema) {
    if (!isObject(schema)) {
        return ['schema 格式错误（应为对象）'];
    }
    const errors = [];
    validateNode(manifest, schema, '$', errors);
    return errors;
}
/**
 * 加载 Agent Plugins 1.0.0 schema：
 * - 缓存新鲜（mtime < TTL）→ 直接读缓存，不发起网络请求
 * - 缓存缺失或过期 → 经 fetchFn 拉取远程，成功后写回缓存
 * - 获取/解析失败 → 抛错（调用方降级为 ⚠️，不硬失败）
 */
async function loadPluginSchema(cacheDir, fetchFn) {
    const cachePath = pluginSchemaCachePath(cacheDir);
    if (isSchemaCacheFresh(cachePath)) {
        const raw = fs.readFileSync(cachePath).toString('utf8');
        return { schema: JSON.parse(raw), source: 'cache' };
    }
    const response = await fetchFn(exports.PLUGIN_SCHEMA_URL);
    if (!response.ok) {
        throw new Error(`schema 获取失败（状态码 ${response.status}）`);
    }
    const schema = (await response.json());
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(schema, null, 2));
    return { schema, source: 'remote' };
}
