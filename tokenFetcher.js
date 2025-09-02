// tokenFetcher.js
const axios = require('axios');
require('dotenv').config();
const generateJWT = require('./jwtGenerator');

async function fetchAccessToken() {
  const jwtToken = generateJWT();

  try {
    const response = await axios.post('https://auth.worksmobile.com/oauth2/v2.0/token', new URLSearchParams({
      assertion: jwtToken,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      scope: process.env.SCOPE
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

// 🔽 ここに追加！
console.log('✅ トークン取得レスポンス:', response.data);
console.log('🔐 生成したJWT:', jwtToken);
console.log('✅ アクセストークン:', response.data.access_token);
    return response.data.access_token;
  } catch (error) {
    console.error('❌ トークン取得エラー:', error.response?.data || error.message);
  }
}

module.exports = fetchAccessToken;