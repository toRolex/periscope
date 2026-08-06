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
exports.createMockServer = createMockServer;
const http = __importStar(require("node:http"));
/**
 * 启动本地 mock HTTP server，记录所有请求，返回 openai 协议 fixture 响应。
 * 全程离线，无需真实 API key。
 */
function createMockServer(options = {}) {
    const requests = [];
    const server = http.createServer((req, res) => {
        const request = req;
        const response = res;
        let raw = '';
        request.on('data', (chunk) => {
            raw += chunk.toString('utf8');
        });
        request.on('end', () => {
            const headers = {};
            for (const key of Object.keys(request.headers ?? {})) {
                const value = request.headers[key];
                headers[key] = Array.isArray(value) ? String(value[0]) : String(value);
            }
            let jsonBody;
            try {
                jsonBody = JSON.parse(raw);
            }
            catch {
                jsonBody = undefined;
            }
            const recorded = {
                method: String(request.method ?? ''),
                url: String(request.url ?? ''),
                headers,
                body: raw,
                jsonBody,
            };
            requests.push(recorded);
            const handled = options.handler ? options.handler(recorded) : undefined;
            const status = handled ? handled.status : (options.defaultStatus ?? 200);
            const body = handled?.body ??
                options.defaultBody ??
                JSON.stringify({ choices: [{ message: { content: 'mock 默认描述' } }] });
            response.statusCode = status;
            response.setHeader('content-type', 'application/json');
            response.end(body);
        });
    });
    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            const port = addr && typeof addr === 'object' ? addr.port : 0;
            resolve({
                baseUrl: `http://127.0.0.1:${port}`,
                requests,
                close: () => new Promise((res, rej) => server.close((err) => (err ? rej(err) : res()))),
            });
        });
    });
}
