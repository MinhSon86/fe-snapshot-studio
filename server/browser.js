// Shared headless Chromium instance. Automatically downloads Chromium on first use
// so the tool works on a fresh machine without manual setup.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { ROOT } from './paths.js';

let browserPromise = null;

function installChromium() {
  return new Promise((resolve, reject) => {
    console.log('[setup] Chromium chưa có – đang tự động tải về (chỉ lần đầu)...');
    const p = spawn('npx playwright install chromium', { cwd: ROOT, shell: true, stdio: 'inherit' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('Không tải được Chromium (exit ' + code + ')'))));
    p.on('error', reject);
  });
}

async function launch() {
  try {
    return await chromium.launch({ headless: true });
  } catch (e) {
    if (/Executable doesn't exist|playwright install/i.test(e.message)) {
      await installChromium();
      return await chromium.launch({ headless: true });
    }
    throw e;
  }
}

export async function getBrowser() {
  if (!browserPromise) {
    browserPromise = launch();
    browserPromise.catch(() => { browserPromise = null; });
  }
  const b = await browserPromise;
  if (!b.isConnected()) {
    browserPromise = null;
    return getBrowser();
  }
  return b;
}

export async function launchProfile(userDataDir, options = {}) {
  // Let Chromium restore its own session data in the dedicated profile.
  const settings = { headless: false, channel: 'chromium', ...options, args: ['--restore-last-session', ...(options.args || [])] };
  try {
    return await chromium.launchPersistentContext(userDataDir, settings);
  } catch (e) {
    if (!/Executable doesn't exist|playwright install/i.test(e.message)) throw e;
    await installChromium();
    return chromium.launchPersistentContext(userDataDir, settings);
  }
}

export async function closeBrowser() {
  if (browserPromise) {
    try { (await browserPromise).close(); } catch { /* ignore */ }
    browserPromise = null;
  }
}
