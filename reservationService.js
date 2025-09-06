const { writeReservationData } = require('./sheetsWriter');
const { isValidReservation } = require('./calendarUtils');

/**
 * Google Sheets に予約を登録する（カレンダー連携なし）
 */
async function registerReservation(userId, selectedDate, timeSlot, name, note) {
  if (!isValidReservation(selectedDate, timeSlot)) {
    return `❌ ${selectedDate} の ${timeSlot} は予約できません。別の枠を選んでください。`;
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const dataArray = [[userId, selectedDate, timeSlot, name, note, timestamp]];

  try {
    // await writeReservationData(dataArray);
    console.log(`[INFO] Google Sheets 書き込み完了: ${dataArray}`);

    return `🎉 予約を受け付けました！\n📅 日付：${selectedDate}\n🕒 時間：${timeSlot}\n👤 名前：${name}\n📝 備考：${note}`;
  } catch (err) {
    console.error('[ERROR] 予約登録失敗:', err.message);
    return `❌ 予約の登録に失敗しました。もう一度お試しください。`;
  }
}

module.exports = { registerReservation };