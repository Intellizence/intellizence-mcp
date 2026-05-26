function createMcpHttpLoggingMiddleware() {
  return (req, res, next) => {
    console.log('\n======================');
    console.log('REQUEST');
    console.log('======================\n');

    console.log('METHOD:', req.method);
    console.log('URL:', req.url);

    console.log('\nHEADERS:\n');
    console.log(req.headers);

    if (req.body && Object.keys(req.body).length > 0) {
      console.log('\nBODY:\n');
      console.log(req.body);
    }

    res.on('finish', () => {
      console.log('RESPONSE FINISH');
      console.log('STATUS:', res.statusCode);
      console.log('CONTENT-TYPE:', res.getHeader('content-type') || '');
      console.log('MCP-SESSION-ID HEADER:', res.getHeader('mcp-session-id') || '');
      console.log('RESPONSE HEADERS:', res.getHeaders());

      const mcpUser = res.locals && res.locals.mcpUser ? res.locals.mcpUser : null;
      const mcpToolCall = res.locals && res.locals.mcpToolCall ? res.locals.mcpToolCall : null;
      if (mcpUser || mcpToolCall) {
        console.log('MCP META:');
        if (mcpUser) {
          console.log('user.email:', mcpUser && typeof mcpUser.email === 'string' ? mcpUser.email : '[missing]');
          console.log('user.sub:', mcpUser && typeof mcpUser.sub === 'string' ? mcpUser.sub : '[missing]');
        }
        if (mcpToolCall) {
          console.log('tool.name:', mcpToolCall.name || '[missing]');
          console.log('tool.query:', mcpToolCall.query || '[none]');
          console.log('tool.args:', mcpToolCall.args || {});
        }
      }
    });

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = (body) => {
      console.log('\n======================');
      console.log('RESPONSE JSON');
      console.log('======================\n');

      console.log('STATUS:', res.statusCode);

      console.log('\nRESPONSE HEADERS:\n');
      console.log(res.getHeaders());

      console.log('\nRESPONSE BODY:\n');
      console.log(body);

      return originalJson(body);
    };

    res.send = (body) => {
      console.log('\n======================');
      console.log('RESPONSE SEND');
      console.log('======================\n');

      console.log('STATUS:', res.statusCode);

      console.log('\nRESPONSE HEADERS:\n');
      console.log(res.getHeaders());

      console.log('\nRESPONSE BODY:\n');
      console.log(body);

      return originalSend(body);
    };

    next();
  };
}

export { createMcpHttpLoggingMiddleware };
