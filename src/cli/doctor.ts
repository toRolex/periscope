import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Writable } from 'node:stream';

export interface RunDoctorOptions {
  /** 覆盖 HOME（用于解析默认 config 路径）。 */
  HOME?: string | undefined;
  /** 覆盖 PERISCOPE_CONFIG（优先级最高）。 */
  PERISCOPE_CONFIG?: string | undefined;
  /** 覆盖 Node 版本字符串，默认读 process.version。 */
  nodeVersion?: string | undefined;
  /** 覆盖 dist/ 路径，默认从 __dirname 上溯两层的 dist/。 */
  distDir?: string | undefined;
  /** 仓库根目录（用于读 package.json 的 engines.node）。默认从 __dirname 上溯。 */
  repoRoot?: string | undefined;
}

const REQUIRED_PROTOCOLS = ['openai', 'anthropic', 'responses'] as const;
const REQUIRED_DIST_FILES = ['cli/index.js', 'core/describe.js'];

/** 从 `vX.Y.Z` 解析 major；非匹配返回 0。 */
function parseMajor(version: string): number {
  const m = /^v?(\d+)/.exec(version);
  return m === null ? 0 : Number(m[1]);
}

/** 解析 package.json 的 engines.node 字符串，取 major 下限（如 ">=20.0.0" → 20）。 */
function parseNodeEngineMajor(packageJsonPath: string): number {
  try {
    const raw = fs.readFileSync(packageJsonPath).toString('utf8');
    const pkg = JSON.parse(raw) as { engines?: { node?: string } };
    const spec = pkg.engines?.node ?? '';
    const m = />=\s*(\d+)/.exec(spec);
    return m === null ? 20 : Number(m[1]);
  } catch {
    return 20;
  }
}

function deriveRepoRoot(): string {
  // 编译后 __dirname = <repo>/dist/cli；src 测试时 __dirname = <repo>/src/cli
  // 两者都上溯两级到 repoRoot。
  return path.resolve(__dirname, '..', '..');
}

function deriveDistDir(): string {
  return path.resolve(deriveRepoRoot(), 'dist');
}

/** doctor 单项检查结果。 */
interface CheckResult {
  /** ok / warn / fail → 渲染为 ✅ / ⚠️ / ❌。 */
  status: 'ok' | 'warn' | 'fail';
  /** 一行说明。 */
  detail: string;
}

function checkConfigFile(configPath: string): CheckResult {
  if (!fs.existsSync(configPath)) {
    return {
      status: 'fail',
      detail: `配置文件不存在: ${configPath}（建议运行 periscope init）`,
    };
  }
  return { status: 'ok', detail: `配置文件存在: ${configPath}` };
}

function checkProtocolSections(configPath: string): CheckResult {
  if (!fs.existsSync(configPath)) {
    return { status: 'fail', detail: '配置文件不存在，无法校验协议段' };
  }
  let cfg: Record<string, unknown>;
  try {
    cfg = JSON.parse(fs.readFileSync(configPath).toString('utf8'));
  } catch (err) {
    return {
      status: 'fail',
      detail: `配置文件 JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const missing = REQUIRED_PROTOCOLS.filter((p) => {
    const seg = cfg[p] as { baseUrl?: unknown; model?: unknown } | undefined;
    return !seg || typeof seg.baseUrl !== 'string' || typeof seg.model !== 'string';
  });
  if (missing.length > 0) {
    return { status: 'fail', detail: `协议段缺失或不完整: ${missing.join(', ')}` };
  }
  return { status: 'ok', detail: '协议段 openai / anthropic / responses 完整' };
}

function checkNodeVersion(nodeVersion: string, repoRoot: string): CheckResult {
  const requiredMajor = parseNodeEngineMajor(path.join(repoRoot, 'package.json'));
  const actualMajor = parseMajor(nodeVersion);
  if (actualMajor < requiredMajor) {
    return {
      status: 'fail',
      detail: `Node 版本 ${nodeVersion} 低于 engines.node >=${requiredMajor}`,
    };
  }
  return { status: 'ok', detail: `Node 版本 ${nodeVersion} 满足 >=${requiredMajor}` };
}

function checkDist(distDir: string): CheckResult {
  const missing: string[] = [];
  for (const rel of REQUIRED_DIST_FILES) {
    if (!fs.existsSync(path.join(distDir, rel))) {
      missing.push(rel);
    }
  }
  if (missing.length > 0) {
    return {
      status: 'fail',
      detail: `dist/ 缺少编译产物: ${missing.join(', ')}（运行 npm run build）`,
    };
  }
  return { status: 'ok', detail: `dist/ 编译产物完整 (${distDir})` };
}

const STATUS_ICON: Record<CheckResult['status'], string> = {
  ok: '✅',
  warn: '⚠️',
  fail: '❌',
};

/**
 * periscope doctor：本地自检（v1.1 实现，issue #12）。
 * 四项检查：config 文件存在 / 协议段完整 / Node 版本满足 engines.node / dist/ 编译产物完整。
 * 纯本地：零外部请求，逐项输出 ✅/⚠️/❌，最后一行总结结论。
 */
export async function runDoctor(
  _argv: string[],
  stdout: Writable,
  stderr: Writable,
  options: RunDoctorOptions = {},
): Promise<number> {
  void stderr; // 当前实现不向 stderr 写任何东西（除非错误处理）

  const configPath =
    options.PERISCOPE_CONFIG ??
    path.join(
      options.HOME ?? process.env.HOME ?? '',
      '.config',
      'periscope',
      'config.json',
    );

  const repoRoot = options.repoRoot ?? deriveRepoRoot();
  const distDir = options.distDir ?? deriveDistDir();
  const nodeVersion = options.nodeVersion ?? process.version;

  const checks: { label: string; result: CheckResult }[] = [
    { label: 'config 文件', result: checkConfigFile(configPath) },
    { label: '协议段', result: checkProtocolSections(configPath) },
    { label: 'Node 版本', result: checkNodeVersion(nodeVersion, repoRoot) },
    { label: 'dist/ 编译产物', result: checkDist(distDir) },
  ];

  for (const { label, result } of checks) {
    const icon = STATUS_ICON[result.status];
    stdout.write(`${icon} ${label}: ${result.detail}\n`);
  }

  const failCount = checks.filter((c) => c.result.status === 'fail').length;
  if (failCount === 0) {
    stdout.write('结论: ✅ 全部通过\n');
    return 0;
  }
  stdout.write(`结论: ❌ ${failCount} 项异常\n`);
  return 1;
}