const { writeReservationData, readReservationData } = require('./sheetsWriter');
const { isValidReservation, getAllTimeSlots } = require('./calendarUtils');

/**
 * Google Sheets に予約を登録する（カレンダー連携なし）
 */
async function registerReservation(userId, selectedDate, timeSlot, name, note) {
  if (!isValidReservation(selectedDate, timeSlot)) {
    return `❌ ${selectedDate} の ${timeSlot} は予約できません。別の枠を選んでください。`;
  }

  if (await isDuplicateReservation(userId, selectedDate, timeSlot)) {
    return `⚠️ すでに ${selectedDate} の ${timeSlot} に予約があります。`;
  }

  const formattedDate = selectedDate.replace(/-/g, '/');
  const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '/');
  const dataArray = [[userId, formattedDate, timeSlot, name, note, timestamp]];

  try {
    await writeReservationData(dataArray);
    console.log(`[INFO] 予約データ書き込み成功: ${JSON.stringify(dataArray)}`);

    return (
      `🎉 予約を受け付けました！\n` +
      `📅 日付：${formattedDate}\n` +
      `🕒 時間：${timeSlot}\n` +
      `👤 名前：${name}\n` +
      `📝 備考：${note || 'なし'}`
    );
  } catch (err) {
    console.error('[ERROR] 予約登録失敗:', err.message);
    return (
      `❌ 予約の登録に失敗しました。\n` +
      `原因：${err.message}\n` +
      `もう一度お試しください。`
    );
  }
}

/**
 * Google Sheets から予約をキャンセルする
 */
async function cancelReservation(userId, selectedDate, timeSlot) {
  try {
    const formattedDate = selectedDate.replace(/-/g, '/');
    const allReservations = await readReservationData();

    const header = allReservations[0];
    const dataRows = allReservations.slice(1);

    const filteredRows = dataRows.filter(row => {
      const [id, date, slot] = row;
      return !(id === userId && date === formattedDate && slot === timeSlot);
    });

    if (filteredRows.length === dataRows.length) {
      return `⚠️ 指定された予約は見つかりませんでした。\n📅 ${formattedDate} の ${timeSlot} に予約は存在しないようです。`;
    }

    const updatedData = [header, ...filteredRows];
    await writeReservationData(updatedData);

    console.log(`[INFO] 予約キャンセル完了: ${userId}, ${formattedDate}, ${timeSlot}`);
    return `✅ 予約をキャンセルしました。\n📅 日付：${formattedDate}\n🕒 時間：${timeSlot}`;
  } catch (err) {
    console.error('[ERROR] 予約キャンセル失敗:', err.message);
    return `❌ 予約のキャンセルに失敗しました。\n原因：${err.message}\nもう一度お試しください。`;
  }
}

/**
 * 指定された日付の予約一覧を取得（時間順）
 */
async function getReservationsByDate(selectedDate) {
  const formattedDate = selectedDate.replace(/-/g, '/');
  const allReservations = await readReservationData();

  const header = allReservations[0];
  const dataRows = allReservations.slice(1);

  const filtered = dataRows.filter(row => row[1] === formattedDate);
  const sorted = filtered.sort((a, b) => a[2].localeCompare(b[2]));

  return sorted.map(row => {
    const [userId, , timeSlot, name, note] = row;
    return `🕒 ${timeSlot}｜👤 ${name}｜📝 ${note || 'なし'}`;
  });
}

/**
 * 同じユーザーが同じ枠に予約済みかどうかを判定
 */
async function isDuplicateReservation(userId, selectedDate, timeSlot) {
  const formattedDate = selectedDate.replace(/-/g, '/');
  const allReservations = await readReservationData();
  const dataRows = allReservations.slice(1);

  return dataRows.some(row => {
    const [id, date, slot] = row;
    return id === userId && date === formattedDate && slot === timeSlot;
  });
}

/**
 * 指定日付の空き時間枠を取得
 */
async function getAvailableSlots(selectedDate) {
  const formattedDate = selectedDate.replace(/-/g, '/');
  const allReservations = await readReservationData();
  const dataRows = allReservations.slice(1);

  const reservedSlots = dataRows
    .filter(row => row[1] === formattedDate)
    .map(row => row[2]);

  const allSlots = getAllTimeSlots();
  const available = allSlots.filter(slot => !reservedSlots.includes(slot));

  return available;
}

module.exports = {
  registerReservation,
  cancelReservation,
  getReservationsByDate,
  isDuplicateReservation,
  getAvailableSlots
};