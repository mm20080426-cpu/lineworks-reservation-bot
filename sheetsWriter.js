const { google } = require('googleapis');
require('dotenv').config(); // 環境変数の読み込み

// 改行コードの復元が重要！
const privateKey = process.env.GS_PRIVATE_KEY.replace(/\\n/g, '\n');

const auth = new google.auth.JWT(
  process.env.GS_CLIENT_EMAIL,
  null,
  privateKey,
  ['https://www.googleapis.com/auth/spreadsheets']
);

const sheets = google.sheets({ version: 'v4', auth });

async function writeReservationData(dataArray) {
  const request = {
    spreadsheetId: process.env.GS_SHEET_ID,
    range: '予約データ!A1',
    valueInputOption: 'USER_ENTERED',
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

module.exports = { writeReservationData };