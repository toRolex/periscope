/**
 * CLI 公共工具：跨 describe / doctor / init 三个独立脚本共用的 helper。
 */

/** 把任意 thrown value 收敛成字符串消息；非 Error 实例走 String()。 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}