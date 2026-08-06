import { spawn } from 'node:child_process';

/**
 * spawn 编译后的 hook 脚本，写入 stdin JSON，返回 stdout/stderr/退出码。
 * 入口路径由调用方传入（不同测试的编译产物位于各自目录）。
 */
export function runHook(
  entry: string,
  stdin: string,
  env: Record<string, string | undefined>,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: { toString(): string }) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: { toString(): string }) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code: number | null) => {
      resolve({ stdout, stderr, code: code ?? -1 });
    });
    child.stdin.write(stdin);
    child.stdin.end();
  });
}
