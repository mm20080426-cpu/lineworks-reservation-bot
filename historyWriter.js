const { getSheetsClient } = require('./googleAuth');

const SHEET_ID = 'あなたのスプレッドシートID';
const HISTORY_SHEET_NAME = '履歴';

async function appendToHistorySheet(rowData) {
  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${HISTORY_SHEET_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [rowData],
    },
  });

  console.log('[INFO] 履歴シートに追加成功:', rowData);
}

module.exports = { appendToHistorySheet };