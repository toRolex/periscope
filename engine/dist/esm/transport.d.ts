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
export declare const defaultTransport: HttpTransport;
