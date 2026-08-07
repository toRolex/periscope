#!/usr/bin/env node
import type { Readable, Writable } from 'node:stream';
import { runDescribe } from './describe';
import { runInit } from './init';
import { runDoctor } from './doctor';
import { errorMessage } from './shared';

function usage(): string {
  return '用法: periscope <command> [args]\n  describe <图片...> [--intent "..."]\n  init\n  doctor [--offline]';
}

/**
 * CLI 多命令 dispatch 入口：
 * - `describe`：原有 describe 行为（多图 / URL / --intent）
 * - `init`：交互式选择题写配置（拒绝已存在文件）
 * - `doctor`：本地自检（v1.1 实现，见 #12 + #13；--offline 跳过任何 schema 网络拉取）
 */
export async function main(
  argv: string[],
  stdin: Readable = process.stdin,
  stdout: Writable = process.stdout,
  stderr: Writable = process.stderr,
): Promise<number> {
  const command = argv[0];
  switch (command) {
    case 'describe':
      return runDescribe(argv.slice(1), stdout, stderr);
    case 'init':
      return runInit(argv.slice(1), stdin, stdout, stderr, {
        HOME: process.env.HOME,
        PERISCOPE_CONFIG: process.env.PERISCOPE_CONFIG,
      });
    case 'doctor':
      return runDoctor(argv.slice(1), stdout, stderr, {
        HOME: process.env.HOME,
        PERISCOPE_CONFIG: process.env.PERISCOPE_CONFIG,
        nodeVersion: process.version,
      });
    default: {
      stderr.write(`${usage()}\n`);
      return 1;
    }
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stderr.write(`错误: ${errorMessage(err)}\n`);
      process.exitCode = 1;
    },
  );
}