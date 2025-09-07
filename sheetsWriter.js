const { google } = require('googleapis');
const path = require('path');

// ✅ 共通の認証オブジェクトを使い回す（効率化）
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'google-credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

const spreadsheetId = process.env.GS_SPREADSHEET_ID;
const sheetName = process.env.GS_SHEET_NAME;
const historySheetName = process.env.GS_HISTORY_SHEET_NAME || '予約履歴'; // ✅ 環境変数で切り替え可能

// ✅ 予約データを書き込む（append）
async function writeReservationData(dataArray) {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: dataArray
    }
  });
}

// ✅ 予約データを読み込む（全件）
async function readReservationData() {
  const readonlyAuth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'google-credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });

  const readonlySheets = google.sheets({ version: 'v4', auth: readonlyAuth });

  const response = await readonlySheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:F`,
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    console.warn('[WARN] 予約データが見つかりませんでした');
    return [];
  }

  return rows;
}

// ✅ 履歴シートに1行追記（キャンセル時に使用）
async function appendToHistorySheet(rowData) {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${historySheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [rowData]
    }
  });
}

module.exports = {
  writeReservationData,
  readReservationData,
  appendToHistorySheet // ✅ export 追加
};