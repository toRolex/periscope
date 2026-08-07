import type { Writable } from 'node:stream';

/**
 * periscope doctor：本地自检命令（v1.1 占位）。
 * 完整实现见 issue #12；本占位仅诚实提示用户「尚未实现」并返回非零退出码。
 */
export async function runDoctor(
  _argv: string[],
  _stdout: Writable,
  stderr: Writable,
): Promise<number> {
  stderr.write('periscope doctor: 尚未实现（见 issue #12）\n');
  return 1;
}