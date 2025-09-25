const axios = require('axios');
const generateJWT = require('./jwtGenerator');
require('dotenv').config();

async function isTokenValid(token) {
  try {
    await axios.get('https://www.worksapis.com/v1.0/bots', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return true;
  } catch {
    return false;
  }
}

let cachedToken = null;
let tokenExpireAt = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpireAt) {
    const valid = await isTokenValid(cachedToken);
    if (valid) return cachedToken;
    console.warn('[WARN] キャッシュトークンが無効。再取得します。');
  }

  const jwtToken = generateJWT();
  try {
    const url = process.env.LW_API_TOKEN_URL;
    const params = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwtToken,
      client_id: process.env.LW_CLIENT_ID,
      client_secret: process.env.LW_CLIENT_SECRET
    });

    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const { data } = await axios.post(url, params, { headers });

    cachedToken = data.access_token;
    tokenExpireAt = now + 110 * 60 * 1000;
    console.log('[INFO] アクセストークン取得成功');
    return cachedToken;
  } catch (error) {
    console.error('[ERROR] アクセストークン取得失敗:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = getAccessToken;