import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Writable } from 'node:stream';
import { defaultCacheDir } from '../cache';
import {
  FetchLike,
  isSchemaCacheFresh,
  loadPluginSchema,
  pluginSchemaCachePath,
  validatePluginManifest,
} from './plugin-schema';

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
  /** 覆盖 schema 缓存目录，默认 ~/.cache/periscope。 */
  cacheDir?: string | undefined;
  /** 覆盖 schema 获取函数（测试注入用）；默认全局 fetch。 */
  fetchFn?: FetchLike | undefined;
  /** 覆盖根 plugin.json 路径，默认 <repoRoot>/plugin.json。 */
  pluginJsonPath?: string | undefined;
  /** 离线模式：禁止任何 schema 网络拉取（冷缓存时降级 ⚠️）。默认 false。 */
  offline?: boolean | undefined;
}

/** 解析 doctor 命令行参数。支持 `--offline`（位置无关）。 */
export function parseDoctorArgs(argv: string[]): { offline: boolean; rest: string[] } {
  let offline = false;
  const rest: string[] = [];
  for (const arg of argv) {
    if (arg === '--offline') {
      offline = true;
    } else {
      rest.push(arg);
    }
  }
  return { offline, rest };
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

/**
 * 根 plugin.json schema 合规检查（issue #13）：
 * 按 Agent Plugins 1.0.0 schema 校验仓库根 plugin.json。
 * - 默认行为：缓存命中读缓存，否则 fetch 远程；获取失败 → 降级 ⚠️
 * - 离线模式（offline=true）：即便冷缓存也**绝不调用 fetchFn**；无新鲜缓存 → 降级 ⚠️ 提示离线
 * - plugin.json 不存在或 JSON 非法 → ❌
 * - 校验不合规 → ❌ + 来源提示（JSON path 定位出错字段）
 * 输出带 schema 来源（本地缓存 / 远程），供用户判断权威性。
 */
async function checkPluginSchema(
  pluginJsonPath: string,
  cacheDir: string,
  fetchFn: FetchLike,
  offline: boolean,
): Promise<CheckResult> {
  // 离线模式优先判断：缓存新鲜 → 直接用；否则降级 ⚠️ 且不发请求。
  if (offline) {
    const cachePath = pluginSchemaCachePath(cacheDir);
    if (isSchemaCacheFresh(cachePath)) {
      return validateManifestWithCachedSchema(pluginJsonPath, cachePath);
    }
    return {
      status: 'warn',
      detail:
        '离线模式：schema 未缓存，跳过校验（可先联网跑一次 doctor 预热缓存）',
    };
  }
  let loaded: { schema: Record<string, unknown>; source: 'cache' | 'remote' };
  try {
    loaded = await loadPluginSchema(cacheDir, fetchFn);
  } catch {
    return { status: 'warn', detail: 'schema 获取失败，跳过根 plugin.json 合规校验' };
  }
  return validateManifestAgainstSchema(pluginJsonPath, loaded.schema, loaded.source);
}

/** 离线模式下，从缓存路径直接读 schema 并校验根 manifest。 */
function validateManifestWithCachedSchema(
  pluginJsonPath: string,
  cachePath: string,
): CheckResult {
  let schema: Record<string, unknown>;
  try {
    schema = JSON.parse(fs.readFileSync(cachePath).toString('utf8')) as Record<string, unknown>;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { status: 'warn', detail: `离线模式：缓存 schema 解析失败 (${reason})` };
  }
  return validateManifestAgainstSchema(pluginJsonPath, schema, 'cache');
}

/** 校验根 plugin.json 并产出带 schema 来源的 CheckResult。 */
function validateManifestAgainstSchema(
  pluginJsonPath: string,
  schema: Record<string, unknown>,
  source: 'cache' | 'remote',
): CheckResult {
  if (!fs.existsSync(pluginJsonPath)) {
    return { status: 'fail', detail: `根 plugin.json 不存在: ${pluginJsonPath}` };
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(pluginJsonPath).toString('utf8'));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { status: 'fail', detail: `根 plugin.json JSON 解析失败: ${reason}` };
  }
  const errors = validatePluginManifest(manifest, schema);
  const sourceLabel = source === 'cache' ? '本地缓存' : '远程';
  if (errors.length > 0) {
    return {
      status: 'fail',
      detail: `根 plugin.json 不合规: ${errors.join('; ')}（schema 来源: ${sourceLabel}）`,
    };
  }
  return { status: 'ok', detail: `根 plugin.json 合规（schema 来源: ${sourceLabel}）` };
}

const STATUS_ICON: Record<CheckResult['status'], string> = {
  ok: '✅',
  warn: '⚠️',
  fail: '❌',
};

/**
 * periscope doctor：本地自检（v1.1 实现，issue #12 + #13）。
 * 五项检查：config 文件存在 / 协议段完整 / Node 版本满足 engines.node / dist/ 编译产物完整 /
 * 根 plugin.json schema 合规（#13，schema 缓存 7 天，获取失败降级 ⚠️）。
 * 支持 `--offline`：禁止任何 schema 网络拉取，冷缓存时该项降级为 ⚠️ 并提示先联网跑一次 doctor 预热缓存；
 * 其余 4 项本地自检不受影响。
 */
export async function runDoctor(
  argv: string[],
  stdout: Writable,
  stderr: Writable,
  options: RunDoctorOptions = {},
): Promise<number> {
  void stderr; // 当前实现不向 stderr 写任何东西（保留签名以与 describe/init 的 CLI 入口对称；解析/获取失败均走 ⚠️ 降级到 stdout）

  const { offline } = parseDoctorArgs(argv);

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
  const cacheDir = options.cacheDir ?? defaultCacheDir();
  const fetchFn = options.fetchFn ?? fetch;
  const pluginJsonPath = options.pluginJsonPath ?? path.join(repoRoot, 'plugin.json');

  const schemaResult = await checkPluginSchema(pluginJsonPath, cacheDir, fetchFn, offline);

  const checks: { label: string; result: CheckResult }[] = [
    { label: 'config 文件', result: checkConfigFile(configPath) },
    { label: '协议段', result: checkProtocolSections(configPath) },
    { label: 'Node 版本', result: checkNodeVersion(nodeVersion, repoRoot) },
    { label: 'dist/ 编译产物', result: checkDist(distDir) },
    { label: '根 plugin.json schema', result: schemaResult },
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