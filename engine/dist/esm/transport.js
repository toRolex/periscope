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
