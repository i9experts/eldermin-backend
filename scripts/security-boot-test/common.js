'use strict';
// Shared helpers for the S2a real-boot security test. LOCAL ONLY.
// Hard safety: refuses to run unless MONGODB_URI is exactly the local
// verification database on this machine.
const ALLOWED_URI = 'mongodb://127.0.0.1:27017/eldermin_teacher_verify';
const mongoose = require('mongoose');

// Fail fast if a real provider credential is in the environment (these scripts never need one).
// Start the app under test with launch-app.js: minimal env, dead AWS endpoint, and no-egress.js
// (refuses every non-loopback connection), so no email/SMS/S3/AI/Sentry call can leave the machine.
const SUSPECT = /^(AWS_|ANTHROPIC_|WABA_|QBO_|SENTRY_|SES_|TWILIO_|SENDGRID_|OPENAI_|STRIPE_|GOOGLE_APPLICATION|CLOUDINARY_|S3_|R2_)/i;
function assertNoCloudCreds() {
  const found = Object.keys(process.env).filter((k) => SUSPECT.test(k) && process.env[k]);
  if (found.length) {
    console.error(`Refusing to run: provider credential variables are set (${found.join(', ')}). Unset them first.`);
    process.exit(2);
  }
}

function requireLocalDb() {
  assertNoCloudCreds();
  const uri = process.env.MONGODB_URI;
  if (uri !== ALLOWED_URI) {
    console.error(`Refusing to run: MONGODB_URI must be exactly ${ALLOWED_URI}`);
    process.exit(2);
  }
  return uri;
}
const TAG = 's2a-boot'; // every throwaway tenant slug starts with this
const STATE = process.env.BOOT_TEST_STATE || '.boot-test-state.json';
module.exports = { ALLOWED_URI, requireLocalDb, TAG, STATE, mongoose };
