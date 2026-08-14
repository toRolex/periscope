/**
 * 本文件与主仓 src/transport.ts 逐字一致（纯拷贝，ADR 0003 决策 6）。
 */

export interface HttpRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  text: string;
}

/** 可注入的 HTTP 传输。核心通过它发请求，便于测试时指向本地 mock 端点。 */
export interface HttpTransport {
  post(req: HttpRequest): Promise<HttpResponse>;
}

export const defaultTransport: HttpTransport = {
  async post({ url, headers, body }) {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    return { status: res.status, ok: res.ok, text: await res.text() };
  },
};
