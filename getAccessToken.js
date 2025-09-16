const axios = require('axios');
const generateJWT = require('./jwtGenerator'); // ← JWT生成関数を外部から読み込む
require('dotenv').config(); // .envから環境変数を読み込む

async function getAccessToken() {
  const jwtToken = generateJWT(); // ✅ 毎回新しいJWTを生成

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

    console.log('[INFO] アクセストークン取得成功');
    return data.access_token;
  } catch (error) {
    const errorMsg = error.response?.data || error.message;
    console.error('[ERROR] アクセストークン取得失敗:', errorMsg);
    throw error;
  }
}

// 🔧 即時実行ブロック（CLI実行用）
(async () => {
  try {
    const accessToken = await getAccessToken();
    console.log('\n🔑 アクセストークン:\n', accessToken);
  } catch (err) {
    console.error('\n❌ アクセストークン取得に失敗しました');
  }
})();

module.exports = getAccessToken; // ✅ 他ファイルからも呼び出せるようにエクスポート