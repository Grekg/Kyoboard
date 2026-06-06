const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 10;

// hash password
async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

// compare passwords
async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = {
  hashPassword,
  comparePassword,
};
