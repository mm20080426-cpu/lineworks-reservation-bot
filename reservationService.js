const { writeReservationData } = require('./sheetsWriter');
const { isValidReservation } = require('./calendarUtils');
const { createCalendarEvent } = require('./calendarWriter'); // カレンダー連携を追加

/**
 * Google Sheets に予約を登録し、LINE WORKS カレンダーにも予定を追加する
 * @param {string} userId - LINE WORKS の userId
 * @param {string} selectedDate - 予約対象日（"YYYY-MM-DD" 形式）
 * @param {string} timeSlot - 選択された時間枠（例: "10:00〜10:15"）
 * @param {string} name - 患者名
 * @param {string} note - 備考
 * @returns {Promise<string>} Bot が返信するメッセージ
 */
async function registerReservation(userId, selectedDate, timeSlot, name, note) {
  // 予約可能かどうかをチェック
  if (!isValidReservation(selectedDate, timeSlot)) {
    return `❌ ${selectedDate} の ${timeSlot} は予約できません。別の枠を選んでください。`;
  }

  // 登録日時（実行時点の日付）
  const timestamp = new Date().toISOString().split('T')[0];

  // スプレッドシートに書き込むデータ構成
  const dataArray = [[userId, selectedDate, timeSlot, name, note, timestamp]];

  try {
    // Google Sheets に書き込み
    await writeReservationData(dataArray);
    console.log(`[INFO] Google Sheets 書き込み完了: ${dataArray}`);

    // LINE WORKS カレンダーに予定を登録
    const [startTime, endTime] = timeSlot.split('〜');
    const startDateTime = `${selectedDate}T${startTime}:00+09:00`;
    const endDateTime = `${selectedDate}T${endTime}:00+09:00`;

    await createCalendarEvent(
      userId,
      `診察予約：${name}`,
      startDateTime,
      endDateTime,
      note
    );
    console.log(`[INFO] カレンダー登録完了: ${selectedDate} ${timeSlot}`);

    return `🎉 予約を受け付けました！\n📅 日付：${selectedDate}\n🕒 時間：${timeSlot}\n👤 名前：${name}\n📝 備考：${note}`;
  } catch (err) {
    console.error('[ERROR] 予約登録失敗:', err.message);
    return `❌ 予約の登録に失敗しました。もう一度お試しください。`;
  }
}

module.exports = { registerReservation };