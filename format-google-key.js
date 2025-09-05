const fs = require('fs');

// 認証ファイルを読み込む
const credentials = JSON.parse(fs.readFileSync('./google-credentials.json', 'utf8'));

// 改行を \n に変換
const formattedKey = credentials.private_key.replace(/\n/g, '\\n');

// client_email も取得
const clientEmail = credentials.client_email;

// .env に貼り付ける形式で出力
console.log('GS_CLIENT_EMAIL=' + clientEmail);
console.log('GS_PRIVATE_KEY="' + formattedKey + '"');