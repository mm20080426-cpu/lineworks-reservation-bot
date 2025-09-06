const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config(); // 忘れずに読み込む

async function getAccessToken() {
  const payload = {
    iss: process.env.LW_CLIENT_ID,
    sub: process.env.LW_SERVICE_ACCOUNT,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600 // 1時間
  };

  // 改行コードの復元が重要！
  const privateKey = process.env.LW_PRIVATE_KEY.replace(/\\n/g, '\n');
  const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

  try {
    const url = process.env.LW_API_TOKEN_URL;
    const params = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: token,
      client_id: process.env.LW_CLIENT_ID,
      client_secret: process.env.LW_CLIENT_SECRET,
      #scope: process.env.LW_SCOPE
    });

    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const { data } = await axios.post(url, params, { headers });

    console.log('[INFO] アクセストークン取得成功');
    return data.access_token;
  } catch (error) {
    const errorMsg = error.response?.data || error.message;
    console.error('[ERROR] アクセストークン取得失敗:', errorMsg);
    throw error;
  }
}

module.exports = getAccessToken;