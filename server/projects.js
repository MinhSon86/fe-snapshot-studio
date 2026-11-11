// Project storage: each project is one portable `.fesnap` JSON file (all pages, all
// assets inlined) plus a small `.meta.json` used for fast listing.
import fs from 'node:fs';
import path from 'node:path';
import { PROJECTS_DIR } from './paths.js';

fs.mkdirSync(PROJECTS_DIR, { recursive: true });

const safeId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '');
const fileOf = (id) => path.join(PROJECTS_DIR, safeId(id) + '.fesnap');
const metaOf = (id) => path.join(PROJECTS_DIR, safeId(id) + '.meta.json');

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function listProjects() {
  return fs.readdirSync(PROJECTS_DIR)
    .filter((f) => f.endsWith('.meta.json'))
    .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, f), 'utf8')); } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function loadProject(id) {
  const f = fileOf(id);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

export function saveProject(project) {
  if (!project || !Array.isArray(project.pages)) throw new Error('Dữ liệu project không hợp lệ');
  project.id = safeId(project.id || newId());
  project.format = 'fesnap';
  project.version = 1;
  project.updatedAt = Date.now();
  project.createdAt = project.createdAt || project.updatedAt;
  const json = JSON.stringify(project);
  fs.writeFileSync(fileOf(project.id) + '.tmp', json);
  fs.renameSync(fileOf(project.id) + '.tmp', fileOf(project.id));
  const meta = {
    id: project.id,
    name: project.name || 'Không tên',
    pageCount: project.pages.length,
    updatedAt: project.updatedAt,
    createdAt: project.createdAt,
    thumbnail: project.pages.find((p) => p.thumbnail)?.thumbnail || null,
    sizeBytes: Buffer.byteLength(json),
  };
  fs.writeFileSync(metaOf(project.id), JSON.stringify(meta));
  return meta;
}

export function deleteProject(id) {
  for (const f of [fileOf(id), metaOf(id)]) if (fs.existsSync(f)) fs.unlinkSync(f);
}

export function projectFilePath(id) {
  return fileOf(id);
}
