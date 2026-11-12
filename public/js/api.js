// Thin wrappers around the local server API.
async function req(method, url, body, asBlob) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return asBlob ? res.blob() : res.json();
}

export const api = {
  capture: (opts) => req('POST', '/api/capture', opts),
  browserProfiles: () => req('GET', '/api/browser/profiles'),
  activeBrowserSession: (profile) => req('GET', '/api/browser/sessions?profile=' + encodeURIComponent(profile || 'studio')),
  openBrowserSession: (opts) => req('POST', '/api/browser/sessions', opts),
  browserSession: (id) => req('GET', `/api/browser/sessions/${encodeURIComponent(id)}`),
  captureBrowserSession: (id, tabId) => req('POST', `/api/browser/sessions/${encodeURIComponent(id)}/capture`, { tabId }),
  closeBrowserSession: (id) => req('POST', `/api/browser/sessions/${encodeURIComponent(id)}/close`, {}),
  exportPng: (opts) => req('POST', '/api/export/png', opts, true),
  fontCss: (family) => req('GET', '/api/font-css?family=' + encodeURIComponent(family)),
  listDir: (path) => req('GET', '/api/fs/list?path=' + encodeURIComponent(path || '')),
  run: (dir) => req('POST', '/api/run', { dir }),
  job: (id) => req('GET', '/api/run/' + id),
  stopJob: (id) => req('POST', `/api/run/${id}/stop`),
  projects: () => req('GET', '/api/projects'),
  project: (id) => req('GET', '/api/projects/' + id),
  saveProject: (p) => req('POST', '/api/projects', p),
  importProject: (p) => req('POST', '/api/projects/import', p),
  deleteProject: (id) => req('DELETE', '/api/projects/' + id),
};
