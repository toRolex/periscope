"use strict";
/**
 * CLI 公共工具：跨 describe / init / index 共用的 helper。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorMessage = errorMessage;
/** 把任意 thrown value 收敛成字符串消息；非 Error 实例走 String()。 */
function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
