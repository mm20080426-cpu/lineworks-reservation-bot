const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// 認証情報の読み込み
const keyPath = path.join(__dirname, 'google-credentials.json');
const credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function writeReservationData(dataArray) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  const spreadsheetId = '1CcGlt9ZYgyauJswplG7_39WSSRol1JWq_jn00n1eGpY'; // ← 実際のID
  const sheetName = 'シート1'; // ← 実際のシート名
  const range = `'${sheetName}'!A1`;

  const request = {
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS', // ← 追記モード
    resource: {
      values: dataArray,
    },
  };

  try {
    const response = await sheets.spreadsheets.values.append(request);
    console.log('✅ 書き込み成功:', response.data.updates);
  } catch (error) {
    console.error('❌ 書き込み失敗:', error.response?.data || error.message);
  }
}

// テスト実行（必要に応じて削除）
writeReservationData([
  ['U123456', '10:30～11:00', '2025-09-06 11:10']
]);