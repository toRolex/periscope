"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultTransport = exports.resolveIntent = exports.TASK_TEMPLATES = exports.tryParseJson = exports.responsesAdapter = exports.anthropicAdapter = exports.openaiAdapter = exports.getProtocol = exports.DEFAULT_IMAGE_PROMPT = void 0;
/**
 * periscope-engine：双宿主共享的 describe 引擎叶子（协议适配器 + 任务模板 + HTTP 传输）。
 *
 * 无状态契约：本包不得引入单例或模块级缓存/可变状态——dual-package 分发下
 * CJS 与 ESM 会各加载一份实例，任何模块级状态都会在双宿主间分裂。
 * 只 re-export protocols/templates/transport 的公共面；describe/config 保留在各自宿主副本。
 */
var types_js_1 = require("./protocols/types.js");
Object.defineProperty(exports, "DEFAULT_IMAGE_PROMPT", { enumerable: true, get: function () { return types_js_1.DEFAULT_IMAGE_PROMPT; } });
var index_js_1 = require("./protocols/index.js");
Object.defineProperty(exports, "getProtocol", { enumerable: true, get: function () { return index_js_1.getProtocol; } });
var openai_js_1 = require("./protocols/openai.js");
Object.defineProperty(exports, "openaiAdapter", { enumerable: true, get: function () { return openai_js_1.openaiAdapter; } });
var anthropic_js_1 = require("./protocols/anthropic.js");
Object.defineProperty(exports, "anthropicAdapter", { enumerable: true, get: function () { return anthropic_js_1.anthropicAdapter; } });
var responses_js_1 = require("./protocols/responses.js");
Object.defineProperty(exports, "responsesAdapter", { enumerable: true, get: function () { return responses_js_1.responsesAdapter; } });
var parse_js_1 = require("./protocols/parse.js");
Object.defineProperty(exports, "tryParseJson", { enumerable: true, get: function () { return parse_js_1.tryParseJson; } });
var templates_js_1 = require("./core/templates.js");
Object.defineProperty(exports, "TASK_TEMPLATES", { enumerable: true, get: function () { return templates_js_1.TASK_TEMPLATES; } });
Object.defineProperty(exports, "resolveIntent", { enumerable: true, get: function () { return templates_js_1.resolveIntent; } });
var transport_js_1 = require("./transport.js");
Object.defineProperty(exports, "defaultTransport", { enumerable: true, get: function () { return transport_js_1.defaultTransport; } });
