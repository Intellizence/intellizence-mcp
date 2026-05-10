import { AsyncLocalStorage } from 'node:async_hooks';

const _als = new AsyncLocalStorage();

function runWithRequestContext(ctx, fn) {
  return _als.run(ctx || {}, fn);
}

function getRequestContext() {
  return _als.getStore() || null;
}

export { runWithRequestContext, getRequestContext };
