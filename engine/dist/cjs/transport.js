"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultTransport = void 0;
exports.defaultTransport = {
    async post({ url, headers, body }) {
        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });
        return { status: res.status, ok: res.ok, text: await res.text() };
    },
};
