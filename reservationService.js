const { writeReservationData, readReservationData, updateReservationData } = require('./sheetsWriter');
const { getAvailableTimeSlots, normalizeDate } = require('./calendarUtils');
const { appendToHistorySheet } = require('./historyWriter');
const crypto = require('crypto');

/** 🧼 時間枠の表記を統一（例：09:00〜09:15） */
function normalizeSlot(slot) {
  return slot.replace(/〜|～|~|-/g, '〜').trim();
}

/** 🔐 予約IDを生成（MD5ハッシュの先頭12文字） */
function generateReservationId(userId, date, timeSlot) {
  const raw = `${userId}-${date}-${timeSlot}-${Date.now()}`;
  return crypto.createHash('md5').update(raw).digest('hex').slice(0, 12);
}

/** 📝 予約登録処理 */
async function registerReservation(userId, selectedDate, timeSlot, name, note) {
  const formattedDate = normalizeDate(selectedDate);
  const normalizedSlot = normalizeSlot(timeSlot);

  const allSlotsRaw = getAvailableTimeSlots(formattedDate);
  const availableSlots = Array.isArray(allSlotsRaw) ? allSlotsRaw.map(normalizeSlot) : [];

  if (!availableSlots.includes(normalizedSlot)) {
    console.warn('[WARN] 時間枠が空き枠に含まれていません:', { selected: normalizedSlot, available: availableSlots });
    return `❌ ${formattedDate} の ${normalizedSlot} は予約できません。別の枠を選んでください。`;
  }

  if (await isDuplicateReservation(userId, formattedDate, normalizedSlot)) {
    return `⚠️ すでに ${formattedDate} の ${normalizedSlot} に予約があります。`;
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const reservationId = generateReservationId(userId, formattedDate, normalizedSlot);
  const dataArray = [[reservationId, userId, formattedDate, normalizedSlot, name, note, timestamp, 'reserved', '']];

  try {
    await writeReservationData(dataArray);
    console.log(`[INFO] 予約データ書き込み成功: ${JSON.stringify(dataArray)}`);
    return `🎉 予約を受け付けました！\n📅 日付：${formattedDate}\n🕒 時間：${normalizedSlot}\n👤 名前：${name}\n📝 備考：${note || 'なし'}`;
  } catch (err) {
    console.error('[ERROR] 予約登録失敗:', { userId, reservationId, error: err.message });
    return `❌ 予約の登録に失敗しました。\n原因：${err.message}\nもう一度お試しください。`;
  }
}

/** ❌ 予約キャンセル処理 */
async function cancelReservation(userId, reservationId, selectedDate, timeSlot) {
  try {
    const formattedDate = normalizeDate(selectedDate);
    const normalizedSlot = normalizeSlot(timeSlot);

    const allReservations = await readReservationData();
    const header = allReservations[0];
    const dataRows = allReservations.slice(1);

    const targetIndex = dataRows.findIndex(row =>
      String(row[0]).trim() === String(reservationId).trim() &&
      String(row[2]).trim() === formattedDate &&
      normalizeSlot(row[3]) === normalizedSlot
    );

    if (targetIndex === -1) {
      console.warn('[WARN] キャンセル対象が見つかりません:', { reservationId, date: selectedDate, timeSlot });
      return `⚠️ 指定された予約は見つかりませんでした。\n📅 ${selectedDate} の ${timeSlot} に予約は存在しないようです。`;
    }

    const targetRow = dataRows[targetIndex];
    const cancelledAt = new Date().toISOString().split('T')[0];
    const historyRow = [...targetRow.slice(0, 8), 'cancelled', cancelledAt];
    await appendToHistorySheet(historyRow);

    const filteredRows = dataRows.filter((_, i) => i !== targetIndex);
    const updatedData = [header, ...filteredRows];
    await updateReservationData(updatedData);

    return `✅ 予約をキャンセルしました。\n📅 日付：${selectedDate}\n🕒 時間：${timeSlot}`;
  } catch (err) {
    console.error('[ERROR] 予約キャンセル失敗:', { userId, reservationId, error: err.message });
    return `❌ 予約のキャンセルに失敗しました。\n原因：${err.message}\nもう一度お試しください。`;
  }
}

/** 📋 指定日付の予約一覧取得（表示用） */
async function getReservationsByDate(selectedDate) {
  const formattedDate = normalizeDate(selectedDate);
  const allReservations = await readReservationData();
  const dataRows = allReservations.slice(1);

  const filtered = dataRows.filter(row =>
    String(row[2]).trim() === formattedDate &&
    String(row[7]).trim() === 'reserved'
  );

  const sorted = filtered.sort((a, b) => a[3].localeCompare(b[3]));

  return sorted.map(row => {
    const [reservationId, , , timeSlot, name, note] = row;
    return `🕒 ${normalizeSlot(timeSlot)}｜👤 ${name}｜📝 ${note || 'なし'}｜予約枠ID: ${reservationId}`;
  });
}

/** 📋 指定日付の予約一覧取得（照合用 raw） */
async function getReservationsByDateRaw(selectedDate) {
  const formattedDate = normalizeDate(selectedDate);
  const allReservations = await readReservationData();

  if (!Array.isArray(allReservations) || allReservations.length < 2) {
    console.warn('[WARN] 予約データが空、またはヘッダーのみです');
    return [];
  }

  const dataRows = allReservations.slice(1);
  return dataRows.filter(row => String(row[2]).trim() === formattedDate);
}

/** 🔍 重複予約チェック */
async function isDuplicateReservation(userId, selectedDate, timeSlot) {
  const formattedDate = normalizeDate(selectedDate);
  const normalizedSlot = normalizeSlot(timeSlot);
  const allReservations = await readReservationData();
  const dataRows = allReservations.slice(1);

  return dataRows.some(row => {
    const [, id, date, slot, , , , status] = row;
    return id === userId &&
           date === formattedDate &&
           normalizeSlot(slot) === normalizedSlot &&
           status === 'reserved';
  });
}

/** 🈳 空き枠取得 */
async function getAvailableSlots(selectedDate) {
  const formattedDate = normalizeDate(selectedDate);
  const allReservations = await readReservationData();
  const dataRows = allReservations.slice(1);

  const reservedSet = new Set(
    dataRows
      .filter(row =>
        normalizeDate(row[2]) === formattedDate &&
        String(row[7]).trim() === 'reserved'
      )
      .map(row => normalizeSlot(row[3]))
  );

  const allSlotsRaw = getAvailableTimeSlots(formattedDate);
  const allSlots = Array.isArray(allSlotsRaw) ? allSlotsRaw.map(normalizeSlot) : [];

  return allSlots.filter(slot => !reservedSet.has(slot));
}

module.exports = {
  registerReservation,
  cancelReservation,
  getReservationsByDate,
  getReservationsByDateRaw,
  isDuplicateReservation,
  getAvailableSlots
};