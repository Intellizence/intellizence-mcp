import config from '../core/config.js';

import { createRemoteJWKSet, jwtVerify, decodeJwt, decodeProtectedHeader } from 'jose';

let _auth0Cache = {
  issuer: null,
  audience: null,
  jwks: null,
  jwksUrl: null,
};

function normalizeScopes(value) {
  if (Array.isArray(value)) {
    return value.map((s) => String(s).trim()).filter(Boolean);
  }

  const raw = String(value || '').trim();
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function getAuth0Config() {
  const cfg = config && config.auth0 ? config.auth0 : {};

  const domain = String(process.env.AUTH0_DOMAIN || cfg.domain || '').trim();
  const audience = String(process.env.AUTH0_AUDIENCE || cfg.audience || '').trim();

  const envRequired = process.env.MCP_REQUIRED_SCOPES;
  const requiredScopes = normalizeScopes(envRequired != null ? envRequired : cfg.requiredScopes);

  return {
    domain,
    audience,
    requiredScopes,
  };
}

function extractScopesFromClaims(payload) {
  const scopes = new Set();

  if (payload && typeof payload.scope === 'string') {
    for (const s of payload.scope
      .split(/\s+/)
      .map((x) => x.trim())
      .filter(Boolean)) {
      scopes.add(s);
    }
  }

  const perms = payload && payload.permissions;
  if (Array.isArray(perms)) {
    for (const p of perms) {
      if (typeof p === 'string' && p.trim()) scopes.add(p.trim());
    }
  }

  return Array.from(scopes);
}

function isAuthDebugEnabled() {
  if (process.env.MCP_DEBUG_AUTH != null) {
    const v = String(process.env.MCP_DEBUG_AUTH || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  }

  return Boolean(config && config.debugAuth);
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return '"[unserializable]"';
  }
}

function redactToken(token) {
  const t = String(token || '');
  if (t.length <= 16) return '[redacted]';
  return `${t.slice(0, 8)}...${t.slice(-8)}`;
}

function getUserEmailFromClaims(payload) {
  if (!payload || typeof payload !== 'object') return '';

  if (typeof payload.email === 'string' && payload.email.trim()) {
    return payload.email.trim();
  }

  const namespacedEmail = payload['https://mcp.intellizence.com/email'];
  if (typeof namespacedEmail === 'string' && namespacedEmail.trim()) {
    return namespacedEmail.trim();
  }

  return '';
}

function getBearerAuthHeader(req) {
  return String(req.headers.authorization || req.headers['x-forwarded-authorization'] || req.headers['x-authorization'] || '')
    .trim();
}

async function getUserEmailFromUserinfo(req) {
  const { domain } = getAuth0Config();
  if (!domain) return '';

  const authHeader = getBearerAuthHeader(req);
  if (!authHeader.toLowerCase().startsWith('bearer ')) return '';

  try {
    const upstream = await fetch(`https://${domain}/userinfo`, {
      headers: {
        authorization: authHeader,
      },
    });

    if (!upstream.ok) return '';

    const data = await upstream.json().catch(() => null);
    const email = data && typeof data.email === 'string' ? data.email.trim() : '';
    return email || '';
  } catch {
    return '';
  }
}

async function verifyAuth0Token(req) {
  const authHeader = getBearerAuthHeader(req);
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return { ok: false, message: 'Unauthorized: Missing Bearer token' };
  }

  const token = authHeader.slice('bearer '.length).trim();
  if (!token) {
    return { ok: false, message: 'Unauthorized: Missing Bearer token' };
  }

  if (isAuthDebugEnabled()) {
    process.stderr.write(`Auth debug: bearer=${redactToken(token)}\n`);
  }

  try {
    const hdr = decodeProtectedHeader(token);

    if (isAuthDebugEnabled()) {
      process.stderr.write(`Auth debug: jwt.header=${safeStringify(hdr)}\n`);
    }

    if (hdr && typeof hdr.enc === 'string' && hdr.enc.trim()) {
      return {
        ok: false,
        message:
          'Unauthorized: Encrypted (JWE) token not supported. Configure Auth0 to issue signed JWT (JWS/RS256) access tokens and send that Bearer token.',
      };
    }

    const parts = String(token).split('.');
    if (parts.length === 5) {
      return {
        ok: false,
        message:
          'Unauthorized: Encrypted (JWE) token not supported. Configure Auth0 to issue signed JWT (JWS/RS256) access tokens and send that Bearer token.',
      };
    }
  } catch (e) {
    if (isAuthDebugEnabled()) {
      process.stderr.write(`Auth debug: jwt.header_precheck_error=${e?.message ?? e}\n`);
    }
  }

  const { domain, audience, requiredScopes } = getAuth0Config();
  if (!domain || !audience) {
    return { ok: false, message: 'Server misconfigured: AUTH0_DOMAIN and AUTH0_AUDIENCE are required' };
  }

  const issuer = domain.startsWith('http') ? domain.replace(/\/$/, '') : `https://${domain.replace(/\/$/, '')}`;

  if (_auth0Cache.issuer !== issuer || _auth0Cache.audience !== audience || !_auth0Cache.jwks) {
    const jwksUrl = new URL(`${issuer}/.well-known/jwks.json`);
    _auth0Cache = {
      issuer,
      audience,
      jwksUrl,
      jwks: createRemoteJWKSet(jwksUrl),
    };
  }

  const jwks = _auth0Cache.jwks;
  const debug = isAuthDebugEnabled();

  try {
    const { payload, protectedHeader } = await jwtVerify(token, jwks, {
      issuer: _auth0Cache.issuer + '/',
      audience: _auth0Cache.audience,
    });

    const scopes = extractScopesFromClaims(payload);

    if (isAuthDebugEnabled()) {
      process.stderr.write(`Auth debug: scopes=${JSON.stringify(scopes)}\n`);
    }

    if (requiredScopes.length > 0) {
      const scopeSet = new Set(scopes);
      const missing = requiredScopes.filter((s) => !scopeSet.has(s));
      if (missing.length > 0) {
        return { ok: false, forbidden: true, message: `Forbidden: Missing required scopes: ${missing.join(', ')}` };
      }
    }

    return {
      ok: true,
      payload,
      scopes,
      protectedHeader,
    };
  } catch (err) {
    if (debug) {
      try {
        const hdr = decodeProtectedHeader(token);
        process.stderr.write(`Auth debug: jwt.header=${JSON.stringify(hdr)}\n`);
      } catch (e) {
        process.stderr.write(`Auth debug: jwt.header_decode_error=${e?.message ?? e}\n`);
      }

      try {
        const decoded = decodeJwt(token);
        const debugPayload = {
          iss: decoded && decoded.iss,
          aud: decoded && decoded.aud,
          scope: decoded && decoded.scope,
          permissions: decoded && decoded.permissions,
          exp: decoded && decoded.exp,
        };
        process.stderr.write(`Auth debug: jwt.payload=${JSON.stringify(debugPayload)}\n`);
      } catch (e) {
        process.stderr.write(`Auth debug: jwt.payload_decode_error=${e?.message ?? e}\n`);
      }

      process.stderr.write(`Auth debug: jwtVerify.error=${err?.message ?? err}\n`);
    }
    return { ok: false, message: 'Unauthorized: Invalid token' };
  }
}

export {
  getAuth0Config,
  getBearerAuthHeader,
  getUserEmailFromClaims,
  getUserEmailFromUserinfo,
  isAuthDebugEnabled,
  redactToken,
  safeStringify,
  verifyAuth0Token,
};
