const { writeReservationData, readReservationData, updateReservationData } = require('./sheetsWriter');
const { isValidReservation, getAvailableTimeSlots, normalizeDate } = require('./calendarUtils');
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
  const formattedDate = normalizeDate(selectedDate).replace(/-/g, '/');

  if (!isValidReservation(formattedDate, timeSlot)) {
    return `❌ ${formattedDate} の ${timeSlot} は予約できません。別の枠を選んでください。`;
  }

  if (await isDuplicateReservation(userId, formattedDate, timeSlot)) {
    return `⚠️ すでに ${formattedDate} の ${timeSlot} に予約があります。`;
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const reservationId = generateReservationId(userId, formattedDate, timeSlot);
  const dataArray = [[reservationId, userId, formattedDate, timeSlot, name, note, timestamp, 'reserved', '']];

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

/** ❌ 予約キャンセル処理（照合強化） */
async function cancelReservation(userId, reservationId, selectedDate, timeSlot) {
  try {
    console.log('[DEBUG] cancelReservation() 呼び出し:', {
      userId,
      reservationId,
      selectedDate,
      timeSlot
    });

    if (!selectedDate || typeof selectedDate !== 'string' || !selectedDate.includes('/')) {
      console.warn('[WARN] 日付形式が不正です:', selectedDate);
      return `⚠️ 日付形式が不正です：${selectedDate}`;
    }

    const formattedDate = normalizeDate(selectedDate).replace(/-/g, '/');
    const normalizedSlot = normalizeSlot(timeSlot);

    console.log('[DEBUG] formattedDate:', formattedDate);
    console.log('[DEBUG] normalizedSlot:', normalizedSlot);

    const allReservations = await readReservationData();
    const header = allReservations[0];
    const dataRows = allReservations.slice(1);

    const targetIndex = dataRows.findIndex(row =>
      String(row[0]).trim() === String(reservationId).trim() &&
      String(row[2]).trim() === formattedDate &&
      normalizeSlot(row[3]) === normalizedSlot
    );

    if (targetIndex === -1) {
      console.warn('[WARN] キャンセル対象が見つかりません:', {
        reservationId,
        date: selectedDate,
        timeSlot
      });

      dataRows.forEach((row, i) => {
        console.log(`[候補 ${i}]`, {
          reservationId: row[0],
          date: row[2],
          timeSlot: row[3]
        });
      });

      return `⚠️ 指定された予約は見つかりませんでした。\n📅 ${selectedDate} の ${timeSlot} に予約は存在しないようです。`;
    }

    const targetRow = dataRows[targetIndex];
    console.log('[DEBUG] キャンセル対象行:', targetRow);

    const cancelledAt = new Date().toISOString().split('T')[0];
    const historyRow = [...targetRow.slice(0, 8), 'cancelled', cancelledAt];
    await appendToHistorySheet(historyRow);

    const filteredRows = dataRows.filter((_, i) => i !== targetIndex);
    const updatedData = [header, ...filteredRows];
    await updateReservationData(updatedData);

    console.log(`[INFO] 予約キャンセル完了: ${userId}, ${selectedDate}, ${timeSlot}, ID: ${reservationId}`);
    return `✅ 予約をキャンセルしました。\n📅 日付：${selectedDate}\n🕒 時間：${timeSlot}`;
  } catch (err) {
    console.error('[ERROR] 予約キャンセル失敗:', err.message);
    return `❌ 予約のキャンセルに失敗しました。\n原因：${err.message}\nもう一度お試しください。`;
  }
}

/** 📋 指定日付の予約一覧取得（表示用） */
async function getReservationsByDate(selectedDate) {
  const formattedDate = normalizeDate(selectedDate).replace(/-/g, '/');
  const allReservations = await readReservationData();
  const dataRows = allReservations.slice(1);

  const filtered = dataRows.filter(row => {
    const sheetDate = String(row[2]).trim();
    return sheetDate === formattedDate;
  });

  const sorted = filtered.sort((a, b) => a[3].localeCompare(b[3]));

  return sorted.map(row => {
    const [reservationId, , , timeSlot, name, note] = row;
    return `🕒 ${normalizeSlot(timeSlot)}｜👤 ${name}｜📝 ${note || 'なし'}｜予約枠ID: ${reservationId}`;
  });
}

/** 📋 指定日付の予約一覧取得（照合用 raw） */
async function getReservationsByDateRaw(selectedDate) {
  const formattedDate = normalizeDate(selectedDate).replace(/-/g, '/');
  const allReservations = await readReservationData();

  if (!Array.isArray(allReservations) || allReservations.length < 2) {
    console.warn('[WARN] 予約データが空、またはヘッダーのみです');
    return [];
  }

  const dataRows = allReservations.slice(1); // ヘッダー除去

  const filtered = dataRows.filter(row => {
    const sheetDate = String(row[2]).trim(); // row[2] = 日付
    return sheetDate === formattedDate;
  });

  console.log(`[DEBUG] ${formattedDate} の予約件数:`, filtered.length);
  return filtered;
}

/** 🔍 重複予約チェック */
async function isDuplicateReservation(userId, selectedDate, timeSlot) {
  const formattedDate = normalizeDate(selectedDate).replace(/-/g, '/');
  const allReservations = await readReservationData();
  const dataRows = allReservations.slice(1);

  return dataRows.some(row => {
    const [, id, date, slot] = row;
    return id === userId &&
           date === formattedDate &&
           normalizeSlot(slot) === normalizeSlot(timeSlot);
  });
}

/** 🈳 空き枠取得 */
async function getAvailableSlots(selectedDate) {
  const normalizedSelectedDate = normalizeDate(selectedDate).replace(/-/g, '/');
  const allReservations = await readReservationData();
  const dataRows = allReservations.slice(1);

  const reservedSet = new Set(
    dataRows
      .filter(row => {
        const dateMatch = normalizeDate(row[2]).replace(/-/g, '/') === normalizedSelectedDate;
        return dateMatch;
      })
      .map(row => normalizeSlot(row[3]))
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
  getReservationsByDateRaw,
  isDuplicateReservation,
  getAvailableSlots
};