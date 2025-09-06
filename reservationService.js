const { writeReservationData } = require('./sheetsWriter');

/**
 * Google Sheets に予約を登録する（非同期）
 * @param {string} userId - LINE WORKS の userId
 * @param {string} timeSlot - 選択された時間枠（例: "10:00〜10:15"）
 * @returns {Promise<string>} Bot が返信するメッセージ
 */
async function registerReservation(userId, timeSlot) {
  const today = new Date().toISOString().slice(0, 10);
  const userName = userId; // 必要なら displayName に変更可能
  const dataArray = [[today, userName, timeSlot]];

  try {
    await writeReservationData(dataArray);
    console.log(`[INFO] Google Sheets 書き込み完了: ${dataArray}`);
    return `✅ ${timeSlot} の予約を受け付けました！`;
  } catch (err) {
    console.error('[ERROR] Sheets 書き込み失敗:', err.message);
    return `❌ 予約の登録に失敗しました。もう一度お試しください。`;
  }
}

module.exports = { registerReservation };