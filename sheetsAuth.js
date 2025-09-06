const { google } = require('googleapis');
const path = require('path');

// 🔐 認証オブジェクトを作成
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'google-credentials.json'), // JSONキーのパス
  scopes: ['https://www.googleapis.com/auth/spreadsheets'], // スプレッドシート操作の権限
});

// ✅ 認証済みクライアントを返す関数
async function getSheetsClient() {
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

module.exports = { getSheetsClient };