'use strict';
// Preloaded into the app under test (NODE_OPTIONS=--require .../no-egress.js).
// Makes outbound network calls IMPOSSIBLE: any TCP/TLS connection to a
// non-loopback address is refused before it leaves the process (AWS SES,
// WhatsApp/Meta, Anthropic, Sentry, S3, ... all go through net/tls).
const net = require('net');
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let o = args[0];
  if (Array.isArray(o)) o = o[0];
  const host = typeof o === 'object' && o !== null ? (o.host || (o.path ? 'unix-socket' : 'localhost')) : (typeof args[1] === 'string' ? args[1] : 'localhost');
  if (host !== 'unix-socket' && !LOOPBACK.has(String(host))) {
    const err = new Error(`no-egress guard: blocked outbound connection to ${host}`);
    err.code = 'ECONNREFUSED';
    process.nextTick(() => this.destroy(err));
    return this;
  }
  return origConnect.apply(this, args);
};
