// tokenFetcher.js
const axios = require('axios');
require('dotenv').config();
const generateJWT = require('./jwtGenerator');

async function fetchAccessToken() {
  const jwtToken = generateJWT();

  try {
    const url = 'https://auth.worksmobile.com/oauth2/v2.0/token';
    const payload = new URLSearchParams({
      assertion: jwtToken,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      scope: process.env.SCOPE
    });

    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const { data } = await axios.post(url, payload, { headers });

    console.log(`[INFO] アクセストークン取得成功`);
    return data.access_token;
  } catch (error) {
    const errorMsg = error.response?.data || error.message;
    console.error(`[ERROR] アクセストークン取得失敗: ${errorMsg}`);
    return null;
  }
}

module.exports = fetchAccessToken;