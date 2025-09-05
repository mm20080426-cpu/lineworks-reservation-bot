const axios = require('axios');
require('dotenv').config();
const generateJWT = require('./jwtGenerator');

async function fetchAccessToken() {
  const jwtToken = generateJWT();

  try {
    const url = process.env.LW_API_TOKEN_URL;
    const payload = new URLSearchParams({
      assertion: jwtToken,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      client_id: process.env.LW_CLIENT_ID,
      client_secret: process.env.LW_CLIENT_SECRET,
      scope: process.env.LW_SCOPE
    });

    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const { data } = await axios.post(url, payload, { headers });

    console.log('[INFO] アクセストークン取得成功');
    return data.access_token;
  } catch (error) {
    const errorMsg = error.response?.data || error.message;
    console.error('[ERROR] アクセストークン取得失敗:', errorMsg);
    return null;
  }
}

module.exports = fetchAccessToken;