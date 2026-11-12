import { Router } from 'express';

export function browserApi(sessions) {
  const router = Router();
  router.use((req, res, next) => {
    if (req.get('Origin') && req.get('Origin') !== `${req.protocol}://${req.get('host')}`) {
      return res.status(403).json({ error: 'Chỉ cho phép thao tác phiên từ Studio trên máy này.' });
    }
    if (req.method !== 'GET' && !req.is('application/json')) return res.status(415).json({ error: 'Yêu cầu JSON.' });
    res.set('Cache-Control', 'no-store');
    next();
  });
  const handle = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (error) { res.status(400).json({ error: error.message || 'Không thao tác được phiên trình duyệt.' }); }
  };
  router.get('/profiles', handle(async (req, res) => res.json(sessions.listProfiles())));
  router.get('/sessions', handle(async (req, res) => res.json({ session: sessions.active(req.query.profile || 'studio') })));
  router.post('/sessions', handle(async (req, res) => res.json(await sessions.open(req.body || {}))));
  router.get('/sessions/:id', handle(async (req, res) => res.json(sessions.describe(req.params.id))));
  router.post('/sessions/:id/capture', handle(async (req, res) => res.json(await sessions.capture(req.params.id, req.body?.tabId))));
  router.post('/sessions/:id/close', handle(async (req, res) => { await sessions.close(req.params.id); res.json({ ok: true }); }));
  return router;
}
