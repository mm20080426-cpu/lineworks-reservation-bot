const { writeReservationData, readReservationData } = require('./sheetsWriter');
const { isValidReservation, getAvailableTimeSlots, normalizeDate } = require('./calendarUtils');
const { appendToHistorySheet } = require('./historyWriter');

function normalizeSlot(slot) {
  return slot.replace(/〜|～|~|-/g, '〜').trim();
}

async function registerReservation(userId, selectedDate, timeSlot, name, note) {
  const formattedDate = normalizeDate(selectedDate).replace(/-/g, '/');

  if (!isValidReservation(formattedDate, timeSlot)) {
    return `❌ ${formattedDate} の ${timeSlot} は予約できません。別の枠を選んでください。`;
  }

  if (await isDuplicateReservation(userId, formattedDate, timeSlot)) {
    return `⚠️ すでに ${formattedDate} の ${timeSlot} に予約があります。`;
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const dataArray = [[userId, formattedDate, timeSlot, name, note, timestamp, 'reserved']];

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

    const targetIndex = dataRows.findIndex(row => {
      const [id, date, slot] = row;
      return id === userId &&
             String(date).trim() === formattedDate &&
             normalizeSlot(slot) === normalizeSlot(timeSlot);
    });

    if (targetIndex === -1) {
      return `⚠️ 指定された予約は見つかりませんでした。\n📅 ${formattedDate} の ${timeSlot} に予約は存在しないようです。`;
    }

    const targetRow = dataRows[targetIndex];
    const cancelledAt = new Date().toISOString().split('T')[0];
    const historyRow = [...targetRow.slice(0, 6), 'cancelled', cancelledAt];

    await appendToHistorySheet(historyRow);

    const filteredRows = dataRows.filter((_, i) => i !== targetIndex);
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
  const dataRows = allReservations.slice(1);

  const filtered = dataRows.filter(row => {
    const sheetDate = String(row[1]).trim();
    const status = row[6]?.toLowerCase();
    return sheetDate === formattedDate && status === 'reserved';
  });

  const sorted = filtered.sort((a, b) => a[2].localeCompare(b[2]));

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
  const normalizedSelectedDate = normalizeDate(selectedDate).replace(/-/g, '/');
  const allReservations = await readReservationData();
  const dataRows = allReservations.slice(1);

  const reservedSet = new Set(
    dataRows
      .filter(row => {
        const dateMatch = normalizeDate(row[1]).replace(/-/g, '/') === normalizedSelectedDate;
        const status = row[6]?.toLowerCase();
        return dateMatch && status === 'reserved';
      })
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