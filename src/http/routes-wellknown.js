import config from '../core/config.js';

function registerWellKnownRoutes(app) {
  const openidConfigHandler = (req, res) => {
    const domain = config.auth0.domain;
    if (!domain) {
      return res.status(500).json({ error: 'Server misconfigured: AUTH0_DOMAIN is required' });
    }

    const issuer = `https://${domain}/`;

    return res.status(200).json({
      issuer,
      authorization_endpoint: `https://${domain}/authorize`,
      token_endpoint: `https://${domain}/oauth/token`,
      userinfo_endpoint: `https://${domain}/userinfo`,
      jwks_uri: `https://${domain}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'profile', 'email'],
      claims_supported: ['sub', 'email', 'email_verified', 'name', 'nickname', 'picture', 'updated_at'],
    });
  };

  app.get('/.well-known/openid-configuration', openidConfigHandler);
  app.get('/mcp/.well-known/openid-configuration', openidConfigHandler);

  const oauthAuthServerHandler = (req, res) => {
    const domain = config.auth0.domain;
    if (!domain) {
      return res.status(500).json({ error: 'Server misconfigured: AUTH0_DOMAIN is required' });
    }

    const issuer = `https://${domain}/`;
    return res.status(200).json({
      issuer,
      authorization_endpoint: `https://${domain}/authorize`,
      token_endpoint: `https://${domain}/oauth/token`,
      jwks_uri: `https://${domain}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['openid', 'profile', 'email'],
    });
  };

  app.get('/.well-known/oauth-authorization-server', oauthAuthServerHandler);
  app.get('/mcp/.well-known/oauth-authorization-server', oauthAuthServerHandler);

  const oauthProtectedResourceHandler = (req, res) => {
    const domain = config.auth0.domain;
    const issuer = domain ? `https://${domain}/` : '';
    return res.status(200).json({
      resource: 'https://mcp.intellizence.com/mcp',
      authorization_servers: issuer ? [issuer] : [],
    });
  };

  app.get('/.well-known/oauth-protected-resource', oauthProtectedResourceHandler);
  app.get('/mcp/.well-known/oauth-protected-resource', oauthProtectedResourceHandler);

  const oauthProtectedResourceMcpHandler = (req, res) => {
    const domain = config.auth0.domain;
    const issuer = domain ? `https://${domain}/` : '';
    return res.status(200).json({
      resource: 'https://mcp.intellizence.com/mcp',
      authorization_servers: issuer ? [issuer] : [],
    });
  };

  app.get('/.well-known/oauth-protected-resource/mcp', oauthProtectedResourceMcpHandler);
  app.get('/mcp/.well-known/oauth-protected-resource/mcp', oauthProtectedResourceMcpHandler);

  const jwksHandler = async (req, res) => {
    const domain = config.auth0.domain;
    if (!domain) {
      return res.status(500).json({ error: 'Server misconfigured: AUTH0_DOMAIN is required' });
    }

    try {
      const upstream = await fetch(`https://${domain}/.well-known/jwks.json`);
      const text = await upstream.text();
      res.status(upstream.status);
      res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
      return res.send(text);
    } catch {
      return res.status(502).json({ error: 'Upstream jwks fetch failed' });
    }
  };

  app.get('/.well-known/jwks.json', jwksHandler);
  app.get('/mcp/.well-known/jwks.json', jwksHandler);
}

export { registerWellKnownRoutes };
