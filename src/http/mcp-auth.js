function getUserEmailFromAuthPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  if (typeof payload.email === 'string' && payload.email.trim()) {
    return payload.email.trim();
  }

  const namespacedEmail = payload['https://mcp.intellizence.com/email'];
  if (typeof namespacedEmail === 'string' && namespacedEmail.trim()) {
    return namespacedEmail.trim();
  }

  return null;
}

function getUserFromAuthResult(authResult) {
  const payload = authResult && authResult.payload ? authResult.payload : null;
  return {
    sub: payload && typeof payload.sub === 'string' ? payload.sub : null,
    email: getUserEmailFromAuthPayload(payload),
  };
}

export { getUserEmailFromAuthPayload, getUserFromAuthResult };
