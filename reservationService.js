const { writeReservationData } = require('./sheetsWriter');
const { isValidReservation } = require('./calendarUtils');

/**
 * Google Sheets に予約を登録する（非同期）
 * @param {string} userId - LINE WORKS の userId
 * @param {string} dateStr - "YYYY-MM-DD" 形式の日付
 * @param {string} timeSlot - 選択された時間枠（例: "10:00〜10:15"）
 * @param {string} name - 患者名
 * @param {string} note - 備考
 * @returns {Promise<string>} Bot が返信するメッセージ
 */
async function registerReservation(userId, dateStr, timeSlot, name, note) {
  if (!isValidReservation(dateStr, timeSlot)) {
    return `❌ ${dateStr} の ${timeSlot} は予約できません。別の枠を選んでください。`;
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const dataArray = [[userId, timeSlot, dateStr, name, note, timestamp]];

  try {
    await writeReservationData(dataArray);
    console.log(`[INFO] Google Sheets 書き込み完了: ${dataArray}`);
    return `🎉 予約を受け付けました！\n📅 日付：${dateStr}\n🕒 時間：${timeSlot}\n👤 名前：${name}\n📝 備考：${note}`;
  } catch (err) {
    console.error('[ERROR] Sheets 書き込み失敗:', err.message);
    return `❌ 予約の登録に失敗しました。もう一度お試しください。`;
  }
}

module.exports = { registerReservation };