// jwtGenerator.js
const fs = require('fs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const PRIVATE_KEY = process.env.PRIVATE_KEY.replace(/\\n/g, '\n');

function generateJWT() {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: process.env.CLIENT_ID,
    sub: process.env.SERVICE_ACCOUNT,
    iat: now,
    exp: now + 3600
    aud: process.env.API_TOKEN_URL
  };

  return jwt.sign(payload, PRIVATE_KEY, {
    algorithm: 'RS256',
    header: { alg: 'RS256', typ: 'JWT' }
  });
}

module.exports = generateJWT;
