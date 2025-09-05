const jwt = require('jsonwebtoken');
require('dotenv').config(); // 環境変数の読み込み

// 改行コードの復元が重要！
const PRIVATE_KEY = process.env.LW_PRIVATE_KEY.replace(/\\n/g, '\n');

function generateJWT() {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: process.env.LW_CLIENT_ID,
    sub: process.env.LW_SERVICE_ACCOUNT,
    iat: now,
    exp: now + 3600,
    aud: process.env.LW_API_TOKEN_URL
  };

  return jwt.sign(payload, PRIVATE_KEY, {
    algorithm: 'RS256',
    header: { alg: 'RS256', typ: 'JWT' }
  });
}

module.exports = generateJWT;