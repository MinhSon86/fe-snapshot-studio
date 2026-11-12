// FE Snapshot Studio – local server.
import express from 'express';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { PUBLIC_DIR } from './paths.js';
import { capture, renderPng } from './capture.js';
import { startJob, getJob, stopJob, stopAll, listDir, detect } from './runner.js';
import { listProjects, loadProject, saveProject, deleteProject, newId, projectFilePath } from './projects.js';
import { closeBrowser } from './browser.js';
import { CaptureSessions } from './sessions.js';
import { browserApi } from './browser-api.js';

const app = express();
const sessions = new CaptureSessions();
app.use(express.json({ limit: '500mb' }));
app.use(express.static(PUBLIC_DIR));

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || String(e) });
  }
};

/* ---- snapshot ---- */
app.use('/api/browser', browserApi(sessions));

app.post('/api/capture', wrap(async (req, res) => {
  const { url, width, height, wait } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Thiếu URL' });
  const result = await capture({ url, width: Number(width) || 1440, height: Number(height) || 900, wait: Number(wait) || 1200 });
  res.json(result);
}));

app.post('/api/export/png', wrap(async (req, res) => {
  const { html, width, height, fullPage } = req.body || {};
  const png = await renderPng({ html, width: Number(width) || 1440, height: Number(height) || 900, fullPage: fullPage !== false });
  res.type('png').send(png);
}));

/* ---- source folder runner ---- */
app.get('/api/fs/list', wrap(async (req, res) => res.json(listDir(req.query.path || ''))));
app.get('/api/detect', wrap(async (req, res) => res.json(detect(req.query.dir))));
app.post('/api/run', wrap(async (req, res) => res.json(startJob(req.body.dir))));
app.get('/api/run/:id', wrap(async (req, res) => {
  const j = getJob(req.params.id);
  return j ? res.json(j) : res.status(404).json({ error: 'Không tìm thấy tiến trình' });
}));
app.post('/api/run/:id/stop', wrap(async (req, res) => res.json({ ok: stopJob(req.params.id) })));

/* ---- projects ---- */
app.get('/api/projects', wrap(async (req, res) => res.json(listProjects())));
app.get('/api/projects/:id', wrap(async (req, res) => {
  const p = loadProject(req.params.id);
  return p ? res.json(p) : res.status(404).json({ error: 'Không tìm thấy project' });
}));
app.post('/api/projects', wrap(async (req, res) => res.json(saveProject(req.body))));
app.post('/api/projects/import', wrap(async (req, res) => {
  const p = req.body;
  if (!p || p.format !== 'fesnap') return res.status(400).json({ error: 'File không phải định dạng .fesnap' });
  p.id = newId();
  res.json(saveProject(p));
}));
app.delete('/api/projects/:id', wrap(async (req, res) => { deleteProject(req.params.id); res.json({ ok: true }); }));
app.get('/api/projects/:id/download', wrap(async (req, res) => {
  const f = projectFilePath(req.params.id);
  if (!fs.existsSync(f)) return res.status(404).end();
  const name = (loadProject(req.params.id)?.name || 'project').replace(/[^\p{L}\p{N}_ -]/gu, '_');
  res.download(f, `${name}.fesnap`);
}));

/* ---- start ---- */
function findPort(start) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(findPort(start + 1)));
    s.listen(start, '127.0.0.1', () => s.close(() => resolve(start)));
  });
}

const port = await findPort(Number(process.env.PORT) || 5178);
app.listen(port, '127.0.0.1', () => {
  const url = `http://localhost:${port}`;
  console.log(`\n  FE Snapshot Studio đang chạy tại: ${url}\n  (Ctrl+C để thoát)\n`);
  if (!process.env.NO_OPEN) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    spawn(cmd, { shell: true, stdio: 'ignore' }).on('error', () => {});
  }
});

const shutdown = async () => { stopAll(); await sessions.closeAll(); await closeBrowser(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
