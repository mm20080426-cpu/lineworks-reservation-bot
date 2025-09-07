const { google } = require('googleapis');
const path = require('path');

async function writeReservationData(dataArray) {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'google-credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const spreadsheetId = process.env.GS_SPREADSHEET_ID;
  const sheetName = process.env.GS_SHEET_NAME;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: dataArray
    }
  });
}

async function readReservationData() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'google-credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const spreadsheetId = process.env.GS_SPREADSHEET_ID;
  const sheetName = process.env.GS_SHEET_NAME;

  const response = await sheets.spreadsheets.values.get({
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

module.exports = {
  writeReservationData,
  readReservationData
};