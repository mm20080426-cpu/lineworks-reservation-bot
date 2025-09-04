const jwt = require('jsonwebtoken');
const axios = require('axios');

async function getAccessToken() {
  const payload = {
    iss: process.env.CLIENT_ID,
    sub: process.env.SERVICE_ACCOUNT,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600 // 1時間
  };

  const token = jwt.sign(payload, process.env.PRIVATE_KEY, { algorithm: 'RS256' });

  try {
    const url = 'https://auth.worksmobile.com/oauth2/v2.0/token';
    const payload = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: token,
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      scope: process.env.SCOPE
    });

    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const { data } = await axios.post(url, payload, { headers });

    console.log('[INFO] アクセストークン取得成功');
    return data.access_token;
  } catch (error) {
    const errorMsg = error.response?.data || error.message;
    console.error('[ERROR] アクセストークン取得失敗:', errorMsg);
    throw error;
  }
}

module.exports = getAccessToken;