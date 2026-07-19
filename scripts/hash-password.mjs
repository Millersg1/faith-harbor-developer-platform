// Generates a scrypt password hash for ADMIN_PASSWORD_HASH.
//
// Usage:
//   node scripts/hash-password.mjs "your-password"
//
// Copy the printed value into the server's .env as:
//   ADMIN_PASSWORD_HASH=scrypt$....

import {
  randomBytes,
  scryptSync,
} from "node:crypto";

const password = process.argv[2];

if (!password) {
  console.error(
    'Usage: node scripts/hash-password.mjs "your-password"',
  );

  process.exit(1);
}

const salt = randomBytes(16);
const derived = scryptSync(
  password,
  salt,
  64,
);

console.log(
  `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`,
);
