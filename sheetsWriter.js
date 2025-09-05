require('dotenv').config(); // .env 読み込み
const { google } = require('googleapis');

// 🔍 デバッグログ（認証情報の確認）
console.log('[DEBUG] client_email:', credentials.client_email ? 'OK' : '未設定');
console.log('[DEBUG] private_key preview:', credentials.private_key?.slice(0, 30));

// JWT 認証の初期化
const auth = new google.auth.JWT(
  process.env.GS_CLIENT_EMAIL,
  null,
  process.env.GS_PRIVATE_KEY.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/spreadsheets']
);

// 🔍 認証確認（デバッグ用）
auth.authorize((err, tokens) => {
  if (err) {
    console.error('❌ JWT 認証失敗:', err);
  } else {
    console.log('✅ JWT 認証成功');
  }
});

// Sheets API の初期化
const sheets = google.sheets({ version: 'v4', auth });

// ✅ 予約データ書き込み関数
async function writeReservationData(dataArray) {
  const spreadsheetId = process.env.GS_SHEET_ID; // .env から取得
  const sheetName = process.env.GS_SHEET_NAME || '予約データ'; // 任意で .env 管理
  const range = `${sheetName}!A1`;

  const request = {
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    resource: { values: dataArray },
  };

  try {
    const response = await sheets.spreadsheets.values.append(request);
    console.log('✅ 書き込み成功:', response.data.updates);
  } catch (error) {
    console.error('❌ 書き込み失敗:', error.response?.data || error.message);
  }
}

module.exports = { writeReservationData };