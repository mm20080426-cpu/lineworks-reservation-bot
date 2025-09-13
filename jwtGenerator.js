const jwt = require('jsonwebtoken');
require('dotenv').config(); // .envから環境変数を読み込む

// 改行コードの復元（.envで1行に書かれた秘密鍵を正しく復元）
const PRIVATE_KEY = process.env.LW_PRIVATE_KEY.replace(/\\n/g, '\n');

// JWT生成関数
function generateJWT() {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: process.env.LW_CLIENT_ID,           // クライアントID
    sub: process.env.LW_SERVICE_ACCOUNT,     // サービスアカウント
    aud: process.env.LW_API_TOKEN_URL,       // トークンエンドポイント
    scope: process.env.LW_SCOPE, // ✅ 追加
    iat: now,
    exp: now + 3600
  };

  const token = jwt.sign(payload, PRIVATE_KEY, {
    algorithm: 'RS256',
    header: { alg: 'RS256', typ: 'JWT' }
  });

  return token;
}

module.exports = generateJWT;


// JWT生成＆ログ出力
const jwtToken = generateJWT();
console.log('\n🧾 生成されたJWT:\n');
console.log(jwtToken);
console.log('\n🔍 JWT長さ:', jwtToken.length);