const { google } = require('googleapis');
const path = require('path');

// ✅ 認証クライアント取得関数（共通化）
async function getSheetsClient() {
  try {
    const keyPath = process.env.GS_CREDENTIAL_PATH || path.join(__dirname, 'google-credentials.json');
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client });
  } catch (err) {
    console.error('[ERROR] Google Sheets 認証失敗:', err.message);
    throw err;
  }
}

// ✅ 環境変数の取得（安全性向上）
const spreadsheetId = process.env.GS_SPREADSHEET_ID;
const sheetName = process.env.GS_SHEET_NAME;
const historySheetName = process.env.GS_HISTORY_SHEET_NAME || '予約履歴';

if (!spreadsheetId || !sheetName) {
  console.warn('[WARN] 環境変数 GS_SPREADSHEET_ID または GS_SHEET_NAME が未定義です');
}

/** 📝 新規予約データを追記（append） */
async function writeReservationData(dataArray) {
  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: dataArray },
    });
    console.log('[INFO] 新規予約データ追加成功:', dataArray);
  } catch (err) {
    console.error('[ERROR] 新規予約データ追加失敗:', err.message);
    throw err;
  }
}

/** 🔄 予約データを全件更新（キャンセル後など） */
async function updateReservationData(dataArray) {
  try {
    const sheets = await getSheetsClient();

    // ✅ 先にシート全体をクリア
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${sheetName}!A1:Z1000`,
    });

    // ✅ 新しいデータを上書き保存
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: dataArray },
    });

    console.log('[INFO] 予約データ更新成功:', dataArray);
  } catch (err) {
    console.error('[ERROR] 予約データ更新失敗:', err.message);
    throw err;
  }
}

/** 📖 予約データを読み込む（全件取得） */
async function readReservationData() {
  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:I`,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.warn('[WARN] 予約データが見つかりませんでした');
      return [['予約ID', 'ユーザーID', 'selectedDate', '時間枠', '名前', '備考', '登録日', '状態', 'cancelledAt']];
    }

    return rows;
  } catch (err) {
    console.error('[ERROR] 予約データ読み込み失敗:', err.message);
    throw err;
  }
}

/** 📚 履歴シートに1行追加（キャンセル時） */
async function appendToHistorySheet(rowData) {
  try {
    if (rowData.length < 9) {
      rowData.push(new Date().toISOString().split('T')[0]);
    }

    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${historySheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowData] },
    });

    console.log('[INFO] 履歴シートに追加成功:', rowData);
  } catch (err) {
    console.error('[ERROR] 履歴シート追加失敗:', err.message);
    throw err;
  }
}

module.exports = {
  writeReservationData,
  updateReservationData,
  readReservationData,
  appendToHistorySheet
};