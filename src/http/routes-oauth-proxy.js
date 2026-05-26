import { getAuth0Config } from './auth0.js';

function registerOauthProxyRoutes(app) {
  app.get('/authorize', (req, res) => {
    const { domain } = getAuth0Config();
    if (!domain) {
      return res.status(500).json({ error: 'Server misconfigured: AUTH0_DOMAIN is required' });
    }

    const qsIndex = req.originalUrl.indexOf('?');
    const qs = qsIndex >= 0 ? req.originalUrl.slice(qsIndex) : '';
    return res.redirect(302, `https://${domain}/authorize${qs}`);
  });

  app.post('/oauth/token', async (req, res) => {
    const { domain } = getAuth0Config();
    if (!domain) {
      return res.status(500).json({ error: 'Server misconfigured: AUTH0_DOMAIN is required' });
    }

    try {
      const contentType = String(req.headers['content-type'] || '').toLowerCase();
      let body;
      if (contentType.includes('application/json')) {
        body = JSON.stringify(req.body || {});
      } else {
        body = new URLSearchParams(req.body || {}).toString();
      }

      const upstream = await fetch(`https://${domain}/oauth/token`, {
        method: 'POST',
        headers: {
          'content-type': contentType.includes('application/json')
            ? 'application/json'
            : 'application/x-www-form-urlencoded',
          ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
        },
        body,
      });

      const text = await upstream.text();
      res.status(upstream.status);
      res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
      return res.send(text);
    } catch {
      return res.status(502).json({ error: 'Upstream token exchange failed' });
    }
  });

  app.post('/token', async (req, res) => {
    req.url = '/oauth/token';
    return app._router.handle(req, res, () => {});
  });

  app.get('/userinfo', async (req, res) => {
    const { domain } = getAuth0Config();
    if (!domain) {
      return res.status(500).json({ error: 'Server misconfigured: AUTH0_DOMAIN is required' });
    }

    try {
      const upstream = await fetch(`https://${domain}/userinfo`, {
        headers: {
          ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
        },
      });

      const text = await upstream.text();
      res.status(upstream.status);
      res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
      return res.send(text);
    } catch {
      return res.status(502).json({ error: 'Upstream userinfo request failed' });
    }
  });
}

export { registerOauthProxyRoutes };
