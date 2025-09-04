const { writeReservationData } = require('./sheetsWriter');

/**
 * Google Sheets に予約を登録する
 * @param {string} userId - LINE WORKS の userId
 * @param {string} timeSlot - 選択された時間枠（例: "10:00〜10:15"）
 * @returns {string} Bot が返信するメッセージ
 */
function registerReservation(userId, timeSlot) {
  const today = new Date().toISOString().slice(0, 10); // 例: "2025-09-04"
  const userName = userId; // 必要なら displayName などに変更可能

  const dataArray = [[today, userName, timeSlot]];

  // Google Sheets に書き込み（非同期だが返信は即返す）
  writeReservationData(dataArray)
    .then(() => {
      console.log(`[INFO] Google Sheets 書き込み完了: ${dataArray}`);
    })
    .catch((err) => {
      console.error('[ERROR] Sheets 書き込み失敗:', err.message);
    });

  return `✅ ${timeSlot} の予約を受け付けました！`;
}

module.exports = { registerReservation };