import { defaultTransport, getProtocol } from 'periscope-engine';
/**
 * 连接探测纯逻辑（issue #36，Seam 3 端到端切片一：server 侧探测）。
 *
 * 职责：用「当前生效配置」（settings 命名空间 > cordis.yml > env 三来源归并结果，
 * 壳层经 resolve 注入）构造对视觉端点的探测请求并判定可达性。网络请求归 host half，
 * 走可注入 transport（默认全局 fetch）——浏览器沙盒不直接发网络请求。
 *
 * 探测请求复用协议适配器 buildRequest（URL / 鉴权头 / 请求形状与真实 describe 完全一致，
 * 只带一张 1x1 透明 PNG + "ping" 极简 prompt），故「可达」同时验证了端点路径与鉴权配置。
 * 结果折叠为 ConnectionProbeResult：可达 / 不可达（未配置 / 网络层 / HTTP 层），
 * 不可达必带指向 baseUrl / apiKeyEnv / 网络的可操作提示。任何失败都不抛错。
 */
/** 探测请求用的最小图片（1x1 不透明纯色 PNG）：只验证端点可达与请求形状，不消耗真实图片。
 * 刻意不透明：MiniMax 等上游的内容安全会把透明空白图误判为 sensitive 拒掉（实测 1x1 透明 → HTTP 500，
 * 不透明 → HTTP 200），故探针图不用透明 PNG。 */
const PROBE_IMAGE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOQS7kDAAICAV9Hfkh8';
/** 探测用极简 prompt（尽量轻，端点只需返回任意 2xx 即判定可达）。 */
const PROBE_INTENT = 'ping';
/**
 * 构造连接探测函数（返回 Promise<ConnectionProbeResult>，绝不抛错）。
 * 流程：解析当前生效配置 → 未配置 baseUrl/model 尽早返回可操作提示（与 describe 的
 * endpointMissingError 同策略）→ 协议适配器构造探测请求 → transport 发出 → 折叠结果。
 */
export function makeConnectionProbe(options) {
    const transport = options.transport ?? defaultTransport;
    return async () => {
        const config = await options.resolve();
        if (config.baseUrl.trim() === '' || config.model.trim() === '') {
            return {
                ok: false,
                message: '未配置 baseUrl / model，无法探测',
                hint: '先在卡片填写 Base URL 与模型名并保存，再点击测试连接',
            };
        }
        const adapter = getProtocol(config.protocol);
        const request = adapter.buildRequest({
            baseUrl: config.baseUrl,
            model: config.model,
            imageDataUrl: PROBE_IMAGE_DATA_URL,
            intent: PROBE_INTENT,
            apiKey: config.apiKey || undefined,
        });
        let response;
        try {
            response = await transport.post(request);
        }
        catch (caught) {
            const detail = caught instanceof Error ? caught.message : String(caught);
            return {
                ok: false,
                message: `网络请求失败：${detail}`,
                hint: '检查 baseUrl 是否正确、网络是否可达（代理 / 防火墙 / 离线）',
            };
        }
        if (response.ok) {
            return { ok: true, message: `端点可达（HTTP ${response.status}）` };
        }
        return {
            ok: false,
            message: `端点返回 HTTP ${response.status}`,
            hint: '检查 baseUrl 路径是否正确、模型名是否有效、apiKey 环境变量（apiKeyEnv）是否已设置且被 dsh 进程可见',
        };
    };
}
