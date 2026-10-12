'use strict';
// Shared helpers for the S2a real-boot security test. LOCAL ONLY.
// Hard safety: refuses to run unless MONGODB_URI is exactly the local
// verification database on this machine.
const ALLOWED_URI = 'mongodb://127.0.0.1:27017/eldermin_teacher_verify';
const mongoose = require('mongoose');

function requireLocalDb() {
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
