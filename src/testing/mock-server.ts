import * as http from 'node:http';

export interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string | undefined>;
  body: string;
  jsonBody: unknown;
}

export interface MockServerHandleResult {
  status: number;
  body: string;
}

export interface MockServerOptions {
  /** 自定义响应；返回 undefined 时回落到 defaultStatus/defaultBody。 */
  handler?: (req: RecordedRequest) => MockServerHandleResult | undefined;
  defaultStatus?: number;
  defaultBody?: string;
}

export interface MockServer {
  /** 形如 http://127.0.0.1:<port>，供配置 openai.baseUrl 指向本地端点。 */
  baseUrl: string;
  requests: RecordedRequest[];
  close(): Promise<void>;
}

/**
 * 启动本地 mock HTTP server，记录所有请求，返回 openai 协议 fixture 响应。
 * 全程离线，无需真实 API key。
 */
export function createMockServer(options: MockServerOptions = {}): Promise<MockServer> {
  const requests: RecordedRequest[] = [];
  const server = http.createServer((req, res) => {
    const request = req as any;
    const response = res as any;
    let raw = '';
    request.on('data', (chunk: { toString(encoding?: string): string }) => {
      raw += chunk.toString('utf8');
    });
    request.on('end', () => {
      const headers: Record<string, string | undefined> = {};
      for (const key of Object.keys(request.headers ?? {})) {
        const value = request.headers[key];
        headers[key] = Array.isArray(value) ? String(value[0]) : String(value);
      }
      let jsonBody: unknown;
      try {
        jsonBody = JSON.parse(raw);
      } catch {
        jsonBody = undefined;
      }
      const recorded: RecordedRequest = {
        method: String(request.method ?? ''),
        url: String(request.url ?? ''),
        headers,
        body: raw,
        jsonBody,
      };
      requests.push(recorded);
      const handled = options.handler ? options.handler(recorded) : undefined;
      const status = handled ? handled.status : (options.defaultStatus ?? 200);
      const body =
        handled?.body ??
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
        close: () =>
          new Promise<void>((res, rej) =>
            server.close((err: unknown) => (err ? rej(err) : res())),
          ),
      });
    });
  });
}
