const { google } = require('googleapis');

// 🔐 Render環境変数から認証情報を構築（undefined対策付き）
const credentials = {
  type: process.env.GS_TYPE || '',
  project_id: process.env.GS_PROJECT_ID || '',
  private_key_id: process.env.GS_PRIVATE_KEY_ID || '',
  private_key: (process.env.GS_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  client_email: process.env.GS_CLIENT_EMAIL || '',
  client_id: process.env.GS_CLIENT_ID || '',
  auth_uri: process.env.GS_AUTH_URI || '',
  token_uri: process.env.GS_TOKEN_URI || '',
  auth_provider_x509_cert_url: process.env.GS_AUTH_PROVIDER_CERT_URL || '',
  client_x509_cert_url: process.env.GS_CLIENT_CERT_URL || '',
};

// ✅ Google Sheets API 認証
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// ✅ 書き込み処理
async function writeReservationData(dataArray) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  const spreadsheetId = process.env.GS_SPREADSHEET_ID;
  const sheetName = 'シート1';
  const range = `'${sheetName}'!A1`;

  const request = {
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: dataArray },
  };

  try {
    const response = await sheets.spreadsheets.values.append(request);
    console.log('✅ 書き込み成功:', response.data.updates);
  } catch (error) {
    console.error('❌ 書き込み失敗:', error.response?.data || error.message);
  }
}

// ✅ テスト実行（本番ではコメントアウト推奨）
writeReservationData([
  ['U123456', '10:30～11:00', '2025-09-06 11:10']
]);