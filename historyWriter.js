const { google } = require('googleapis');
const path = require('path');

async function appendToHistorySheet(rowData) {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'google-credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const spreadsheetId = process.env.GS_SPREADSHEET_ID;
  const historySheetName = process.env.GS_HISTORY_SHEET_NAME || '予約履歴';

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${historySheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [rowData]
    }
  });

  console.log('[INFO] 履歴シートに退避完了:', rowData);
}

module.exports = { appendToHistorySheet };