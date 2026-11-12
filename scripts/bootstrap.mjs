import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(args) {
  const [mode = 'setup', ...flags] = args;
  if (!['setup', 'check', 'start'].includes(mode) || flags.some(flag => !['--with-deps', '--no-open'].includes(flag))) {
    throw new Error('Cú pháp: node scripts/bootstrap.mjs setup|check|start [--with-deps] [--no-open]');
  }
  if (mode === 'check' && flags.includes('--with-deps')) throw new Error('Chế độ check không cài đặt. Dùng setup --with-deps.');
  return { mode, withDeps: flags.includes('--with-deps'), noOpen: flags.includes('--no-open') };
}

export function runCommand(command, args, { cwd = ROOT, quiet = false, env = process.env, shell = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, shell, stdio: quiet ? 'pipe' : 'inherit', windowsHide: true });
    let output = '';
    if (quiet) {
      child.stdout.on('data', chunk => { output = (output + chunk).slice(-16000); });
      child.stderr.on('data', chunk => { output = (output + chunk).slice(-16000); });
    }
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code: code ?? 1, signal, output }));
  });
}

export function createSystem({ root = ROOT, log = console.log, run = runCommand } = {}) {
  const npm = (args, quiet = false) => {
    const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    if (process.platform === 'win32' && fs.existsSync(npmCli)) return run(process.execPath, [npmCli, ...args], { cwd: root, quiet });
    // The fallback command contains fixed npm subcommands/flags only, never user input.
    if (process.platform === 'win32') return run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd ' + args.join(' ')], { cwd: root, quiet });
    return run('npm', args, { cwd: root, quiet });
  };
  return {
    platform: process.platform, arch: process.arch, nodeVersion: process.versions.node, log,
    npm: async () => (await npm(['--version'], true)).code === 0,
    dependencies: async () => (await npm(['ls', '--depth=0', '--omit=dev'], true)).code === 0,
    installDependencies: async () => {
      const fresh = !fs.existsSync(path.join(root, 'node_modules'));
      const locked = fs.existsSync(path.join(root, 'package-lock.json'));
      const result = await npm([fresh && locked ? 'ci' : 'install', '--no-audit', '--no-fund']);
      if (result.code) throw new Error('Không cài được thư viện npm. Kiểm tra kết nối mạng/quyền ghi và chạy lại setup.');
    },
    browser: async () => {
      // Probe both engines used by capture and by the persistent project profile.
      const module = await import(pathToFileURL(path.join(root, 'node_modules/playwright/index.mjs')).href);
      for (const options of [{}, { channel: 'chromium' }]) {
        const browser = await module.chromium.launch({ headless: true, timeout: 30000, ...options });
        await browser.close();
      }
    },
    installBrowser: async withDeps => {
      const args = [path.join(root, 'node_modules/playwright/cli.js'), 'install'];
      if (withDeps) args.push('--with-deps');
      args.push('chromium');
      const result = await run(process.execPath, args, { cwd: root });
      if (result.code) throw new Error('Không cài được Chromium. Kiểm tra mạng; trên Linux có thể cần setup --with-deps và quyền sudo.');
    },
    prepareData: () => {
      for (const dir of ['projects', 'browser-profiles/studio']) fs.mkdirSync(path.join(root, 'data', dir), { recursive: true });
    },
    writable: () => fs.accessSync(root, fs.constants.W_OK),
    start: async noOpen => {
      const env = { ...process.env };
      if (noOpen) env.NO_OPEN = '1';
      const result = await run(process.execPath, [path.join(root, 'server/index.js')], { cwd: root, env });
      if (result.code && result.signal !== 'SIGINT') throw new Error('Ứng dụng đã dừng do lỗi. Xem thông báo phía trên.');
    },
  };
}

export async function bootstrap(options, system = createSystem()) {
  const { mode, withDeps = false, noOpen = false } = options;
  const { log } = system;
  log('\n  [ FE ]  SNAPSHOT STUDIO\n  Setup • Kiểm tra • Khởi chạy\n');
  log(`[1/5] Hệ thống: ${system.platform} / ${system.arch} · Node ${system.nodeVersion}`);
  if (!['win32', 'darwin', 'linux'].includes(system.platform) || !['x64', 'arm64'].includes(system.arch)) throw new Error('Hỗ trợ Windows/macOS/Linux, kiến trúc x64 hoặc arm64.');
  if (Number(system.nodeVersion.split('.')[0]) < 20) throw new Error('Cần Node.js >=20. Chạy setup.bat hoặc bash setup.sh để dùng Node portable.');
  system.writable();
  if (!await system.npm()) throw new Error('Không tìm thấy npm. Chạy bộ setup của hệ điều hành để chuẩn bị Node kèm npm.');
  log('[2/5] Kiểm tra thư viện dự án...');
  if (!await system.dependencies()) {
    if (mode === 'check') throw new Error('Thiếu hoặc sai phiên bản thư viện. Chạy setup để cài theo package-lock.json.');
    await system.installDependencies();
    if (!await system.dependencies()) throw new Error('Thư viện chưa đầy đủ sau khi cài. Xem lỗi npm phía trên.');
  }
  log('[3/5] Kiểm tra Chromium và thư viện hệ thống...');
  try { await system.browser(); }
  catch {
    if (mode === 'check') throw new Error('Chromium chưa sẵn sàng. Chạy setup; Linux có thể cần setup --with-deps.');
    await system.installBrowser(withDeps);
    try { await system.browser(); }
    catch { throw new Error('Chromium chưa chạy được. Linux: chạy bash setup.sh --with-deps để cài thư viện hệ thống (có thể cần sudo). Nếu hệ điều hành không được Playwright hỗ trợ, cần nâng cấp hệ điều hành.'); }
  }
  log('[4/5] Thư mục dự án có quyền ghi.');
  if (mode !== 'check') system.prepareData();
  log('[5/5] Sẵn sàng. Profile riêng: data/browser-profiles/studio\n');
  if (mode === 'start') await system.start(noOpen);
  else log(mode === 'check' ? 'Kiểm tra đạt. Không cài hoặc thay đổi dữ liệu.' : 'Setup hoàn tất. Mở start.bat (Windows), start.command (macOS) hoặc bash start.sh (Linux).');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await bootstrap(parseArgs(process.argv.slice(2))); }
  catch (error) { console.error('\n[LỖI] ' + error.message); process.exitCode = 1; }
}
