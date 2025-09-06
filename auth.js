const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

/**
 * LINE WORKS API 用アクセストークンを取得する
 */
async function getAccessToken() {
  const {
    LW_CLIENT_ID,
    LW_CLIENT_SECRET,
    LW_SERVICE_ACCOUNT,
    LW_PRIVATE_KEY,
    LW_API_TOKEN_URL
  } = process.env;

  // JWTペイロード（scopeは含めない！audは固定URL）
  const payload = {
    iss: LW_CLIENT_ID,
    sub: LW_SERVICE_ACCOUNT,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    aud: 'https://auth.worksmobile.com/oauth2/v2.0/token'
  };

  // 改行コードの復元
  const privateKey = LW_PRIVATE_KEY.replace(/\\n/g, '\n');
  const jwtToken = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

  // デバッグ補助：JWTペイロード確認（任意）
  console.log('🔐 JWT Payload:', jwt.decode(jwtToken));

  // リクエストパラメータ（scopeは含めない！）
  const params = new URLSearchParams();
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  params.append('client_id', LW_CLIENT_ID);
  params.append('client_secret', LW_CLIENT_SECRET);
  params.append('assertion', jwtToken);

  // デバッグ補助：送信内容確認（任意）
  console.log('📤 リクエスト送信内容:', Object.fromEntries(params.entries()));

  try {
    const res = await axios.post(LW_API_TOKEN_URL, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    console.log('[INFO] アクセストークン取得成功:', res.data);
    return res.data.access_token;
  } catch (err) {
    console.error('[ERROR] アクセストークン取得失敗:', err.response?.data || err.message);
    throw err;
  }
}

module.exports = { getAccessToken };