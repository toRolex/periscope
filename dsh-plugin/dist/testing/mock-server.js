import * as http from 'node:http';
/**
 * 启动本地 mock HTTP server，记录所有请求，返回 openai 协议 fixture 响应。
 * 全程离线，无需真实 API key。
 */
export function createMockServer(options = {}) {
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
