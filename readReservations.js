const { getSheetsClient } = require('./sheetsAuth');

async function readReservations() {
  const sheets = await getSheetsClient();

  const spreadsheetId = '1CcGlt9ZYgyauJswplG7_39WSSRol1JWq_jn00n1eGpY'; // URLから取得
  const range = 'シート1!A2:D'; // シート名と範囲（例：A列〜D列）

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;
    console.log('📋 取得した予約データ:', rows);
    return rows;
  } catch (error) {
    console.error('❌ 読み込み失敗:', error.response?.data || error.message);
    throw error;
  }
}

readReservations();