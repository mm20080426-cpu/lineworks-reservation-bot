const { writeReservationData } = require('./sheetsWriter');
const { isValidReservation } = require('./calendarUtils'); // ← ステップ③の関数を読み込み

/**
 * Google Sheets に予約を登録する（非同期）
 * @param {string} userId - LINE WORKS の userId
 * @param {string} dateStr - "YYYY-MM-DD" 形式の日付
 * @param {string} timeSlot - 選択された時間枠（例: "10:00〜10:15"）
 * @returns {Promise<string>} Bot が返信するメッセージ
 */
async function registerReservation(userId, dateStr, timeSlot) {
  // バリデーションチェック（念のため）
  if (!isValidReservation(dateStr, timeSlot)) {
    return `❌ ${dateStr} の ${timeSlot} は予約できません。別の枠を選んでください。`;
  }

  const userName = userId; // 必要なら displayName に変更可能
  const dataArray = [[userId, timeSlot, dateStr]];

  try {
    await writeReservationData(dataArray);
    console.log(`[INFO] Google Sheets 書き込み完了: ${dataArray}`);
    return `✅ ${dateStr} の ${timeSlot} の予約を受け付けました！`;
  } catch (err) {
    console.error('[ERROR] Sheets 書き込み失敗:', err.message);
    return `❌ 予約の登録に失敗しました。もう一度お試しください。`;
  }
}

module.exports = { registerReservation };