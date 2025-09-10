const { getSheetsClient } = require('./sheetsAuth');

// ✅ 環境変数から安全に取得（柔軟性向上）
const SHEET_ID = process.env.GS_SPREADSHEET_ID;
const HISTORY_SHEET_NAME = process.env.GS_HISTORY_SHEET_NAME || '予約履歴';

/**
 * ✅ 履歴シートに1行追加（キャンセル時など）
 */
async function appendToHistorySheet(rowData) {
  try {
    // 🔒 I列（cancelledAt）が不足している場合は補完（8列のみ対象）
    if (rowData.length === 8) {
      rowData.push(new Date().toISOString().split('T')[0]); // I列にキャンセル日
    }

    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${HISTORY_SHEET_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: Array.isArray(rowData[0]) ? rowData : [rowData],
      },
    });

    console.log('[INFO] 履歴シートに追加成功:');
    console.table(rowData);
  } catch (err) {
    console.error('[ERROR] 履歴シート追加失敗:', err.message);
    throw err;
  }
}

module.exports = { appendToHistorySheet };