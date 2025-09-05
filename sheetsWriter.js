const { google } = require('googleapis');
const path = require('path');

// JSON鍵のパス（プロジェクトルートに配置している前提）
const KEYFILEPATH = path.join(__dirname, 'google-credentials.json');

// 対象のスプレッドシートID（URLの中にあるID）
const SPREADSHEET_ID = 'あなたのスプレッドシートIDをここに';

// 認証クライアントの作成
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'google-credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// データ書き込み関数
async function writeReservationData(dataArray) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  const request = {
    spreadsheetId: SPREADSHEET_ID,
    range: '予約データ!A1', // シート名と範囲
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: dataArray, // 例: [['2025/09/05', '田中太郎', '10:00']]
    },
  };

  try {
    const response = await sheets.spreadsheets.values.append(request);
    console.log('✅ 書き込み成功:', response.data.updates);
  } catch (error) {
    console.error('❌ 書き込み失敗:', error);
  }
}

module.exports = { writeReservationData };