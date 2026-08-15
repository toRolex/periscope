/**
 * 本文件与主仓 src/transport.ts 逐字一致（纯拷贝，ADR 0003 决策 6）。
 */
export const defaultTransport = {
    async post({ url, headers, body }) {
        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        return { status: res.status, ok: res.ok, text: await res.text() };
    },
};
