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
const index_1 = require("./index");
(0, node_test_1.test)('getProtocol 返回 openai 适配器', () => {
    assert.equal((0, index_1.getProtocol)('openai').name, 'openai');
});
(0, node_test_1.test)('getProtocol 返回 anthropic 适配器', () => {
    assert.equal((0, index_1.getProtocol)('anthropic').name, 'anthropic');
});
(0, node_test_1.test)('getProtocol 返回 responses 适配器', () => {
    assert.equal((0, index_1.getProtocol)('responses').name, 'responses');
});
(0, node_test_1.test)('getProtocol 对未知协议抛错', () => {
    // 配置来自 JSON，运行时可能携带联合外的值；此路径仍须抛错。
    assert.throws(() => (0, index_1.getProtocol)('unknown'), /未知协议/);
});
