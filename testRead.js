require('dotenv').config(); // .env 読み込み
const { readReservationData } = require('./sheetsWriter'); // ← 修正ポイント！

(async () => {
  try {
    console.log('[TEST] readReservationData() を呼び出します...');
    const rows = await readReservationData();
    console.log('[TEST] 読み込んだ予約データ:', rows);
  } catch (err) {
    console.error('[TEST] エラーが発生しました:', err.message);
  }
})();