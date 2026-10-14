'use strict';
// Starts the BUILT backend (dist/main.js) for the boot tests, LOCAL ONLY:
//   node launch-app.js <node-binary> <state-dir> [HR_READ_GUARD_MODE=log] [PORT=3917] [KEY=VALUE ...]
// Safety (documented here on purpose):
//  - FAILS FAST if a cloud/provider credential is present in THIS process's environment
//    (AWS_*, ANTHROPIC_API_KEY, WABA_*, QBO_*, SENTRY_DSN, SES_*, ...): refuse to start.
//  - The child gets a minimal env: no .env is read (cwd = state dir), HOME = state dir,
//    MONGODB_URI forced to the local verification DB, a random throwaway JWT_SECRET,
//    AWS_ENDPOINT_URL pointing at a dead local port, AWS_EC2_METADATA_DISABLED=true.
//  - no-egress.js is preloaded: ANY connection to a non-loopback address is refused, so
//    email, SMS/WhatsApp, S3, Sentry, AI and any other external HTTP are impossible.
//  - Writes <state-dir>/app.pid and <state-dir>/app.log, prints the PID; stop it with
//    kill <that pid> (own PID only).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ALLOWED_URI } = require('./common');

const SUSPECT = /^(AWS_|ANTHROPIC_|WABA_|QBO_|SENTRY_|SES_|TWILIO_|SENDGRID_|OPENAI_|STRIPE_|GOOGLE_APPLICATION|CLOUDINARY_|S3_|R2_)/i;
const found = Object.keys(process.env).filter((k) => SUSPECT.test(k) && process.env[k]);
if (found.length) {
  console.error(`Refusing to start: provider credential variables are set in this environment: ${found.join(', ')}. Unset them (their values were not printed) and retry.`);
  process.exit(2);
}
const [nodeBin, stateDir, ...rest] = process.argv.slice(2);
if (!nodeBin || !stateDir) { console.error('usage: node launch-app.js <node-binary> <state-dir> [KEY=VALUE ...]'); process.exit(2); }
const extra = Object.fromEntries(rest.map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i), kv.slice(i + 1)]; }));
if (Object.keys(extra).some((k) => SUSPECT.test(k) || k === 'MONGODB_URI')) { console.error('Refusing: that variable cannot be overridden here.'); process.exit(2); }

// BOOT_TEST_DIST lets the benchmark start a build from another worktree (e.g. the commit before S3)
const dist = process.env.BOOT_TEST_DIST || path.resolve(__dirname, '..', '..', 'dist', 'main.js');
fs.mkdirSync(stateDir, { recursive: true });
const log = fs.openSync(path.join(stateDir, 'app.log'), 'a');
const child = spawn(nodeBin, [dist], {
  cwd: stateDir, detached: true, stdio: ['ignore', log, log],
  env: {
    PATH: process.env.PATH, HOME: stateDir, NODE_ENV: 'development', FRONTEND_URL: 'http://localhost:5173',
    PORT: '3917', MONGODB_URI: ALLOWED_URI, JWT_SECRET: 'boot-test-throwaway-' + crypto.randomBytes(12).toString('hex'), JWT_EXPIRES_IN: '1h',
    AWS_ENDPOINT_URL: 'http://127.0.0.1:9', AWS_EC2_METADATA_DISABLED: 'true',
    NODE_OPTIONS: `--require ${path.join(__dirname, 'no-egress.js')}`,
    ...extra,
  },
});
child.unref();
fs.writeFileSync(path.join(stateDir, 'app.pid'), String(child.pid));
console.log(String(child.pid));
