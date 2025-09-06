const { google } = require('googleapis');
const credentials = JSON.parse(process.env.GS_CREDENTIALS_JSON);

async function writeReservationData(dataArray) {
  const auth = new google.auth.GoogleAuth({
    credentials,
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

module.exports = { writeReservationData };