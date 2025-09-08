const { writeReservationData, readReservationData } = require('./sheetsWriter');
const { isValidReservation, getAvailableTimeSlots, normalizeDate } = require('./calendarUtils');
const { appendToHistorySheet } = require('./historyWriter');

function normalizeSlot(slot) {
  return slot.replace(/〜|～|~|-/g, '〜').trim();
}

async function registerReservation(userId, selectedDate, timeSlot, name, note) {
  if (!isValidReservation(selectedDate, timeSlot)) {
    return `❌ ${selectedDate} の ${timeSlot} は予約できません。別の枠を選んでください。`;
  }

  if (await isDuplicateReservation(userId, selectedDate, timeSlot)) {
    return `⚠️ すでに ${selectedDate} の ${timeSlot} に予約があります。`;
  }

  const formattedDate = normalizeDate(selectedDate);
  const timestamp = new Date().toISOString().split('T')[0];
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

async function cancelReservation(userId, selectedDate, timeSlot) {
  const formattedDate = normalizeDate(selectedDate).replace(/-/g, '/');
  try {
    const allReservations = await readReservationData();
    const header = allReservations[0];
    const dataRows = allReservations.slice(1);

    const targetRow = dataRows.find(row => {
      const [id, date, slot] = row;
      return id === userId &&
             String(date).trim() === formattedDate &&
             normalizeSlot(slot) === normalizeSlot(timeSlot);
    });

    if (!targetRow) {
      return `⚠️ 指定された予約は見つかりませんでした。\n📅 ${formattedDate} の ${timeSlot} に予約は存在しないようです。`;
    }

    await appendToHistorySheet(targetRow);

    const filteredRows = dataRows.filter(row => row !== targetRow);
    const updatedData = [header, ...filteredRows];
    await writeReservationData(updatedData);

    console.log(`[INFO] 予約キャンセル完了: ${userId}, ${formattedDate}, ${timeSlot}`);
    return `✅ 予約をキャンセルしました。\n📅 日付：${formattedDate}\n🕒 時間：${timeSlot}`;
  } catch (err) {
    console.error('[ERROR] 予約キャンセル失敗:', err.message);
    return `❌ 予約のキャンセルに失敗しました。\n原因：${err.message}\nもう一度お試しください。`;
  }
}

async function getReservationsByDate(selectedDate) {
  const formattedDate = normalizeDate(selectedDate).replace(/-/g, '/');
  const allReservations = await readReservationData();
  const header = allReservations[0];
  const dataRows = allReservations.slice(1);

  const filtered = dataRows.filter(row => {
    const sheetDate = String(row[1]).trim();
    return sheetDate === formattedDate;
  });

  const sorted = filtered.sort((a, b) => a[2].localeCompare(b[2]));

  if (sorted.length === 0) {
    return [`📭 ${formattedDate} の予約はありません。`];
  }

  return sorted.map(row => {
    const [userId, , timeSlot, name, note] = row;
    return `🕒 ${timeSlot}｜👤 ${name}｜📝 ${note || 'なし'}`;
  });
}

async function isDuplicateReservation(userId, selectedDate, timeSlot) {
  const formattedDate = normalizeDate(selectedDate).replace(/-/g, '/');
  const allReservations = await readReservationData();
  const dataRows = allReservations.slice(1);

  return dataRows.some(row => {
    const [id, date, slot] = row;
    return id === userId &&
           date === formattedDate &&
           normalizeSlot(slot) === normalizeSlot(timeSlot);
  });
}

async function getAvailableSlots(selectedDate) {
  const normalizedSelectedDate = normalizeDate(selectedDate);
  const allReservations = await readReservationData();
  const dataRows = allReservations.slice(1);

  const reservedSet = new Set(
  dataRows
    .filter(row => normalizeDate(row[1]) === normalizedSelectedDate)
    .map(row => normalizeSlot(row[2]))
);

  const allSlotsRaw = getAvailableTimeSlots(normalizedSelectedDate);
  const allSlots = Array.isArray(allSlotsRaw) ? allSlotsRaw.map(normalizeSlot) : [];

  const available = allSlots.filter(slot => !reservedSet.has(slot));

  console.log('[DEBUG] selectedDate:', normalizedSelectedDate);
  console.log('[DEBUG] allSlots:', allSlots);
  console.log('[DEBUG] reservedSlots:', Array.from(reservedSet));
  console.log('[DEBUG] available:', available);

  return available;
}

module.exports = {
  registerReservation,
  cancelReservation,
  getReservationsByDate,
  isDuplicateReservation,
  getAvailableSlots
};