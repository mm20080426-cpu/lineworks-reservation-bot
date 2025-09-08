const fs = require('fs');
const path = require('path');

const calendarPath = path.join(__dirname, 'calendar.json');

/**
 * 📅 日付を "YYYY-MM-DD" 形式に統一する
 * calendar.json のキーと一致させるため、区切りを "-" に統一
 */
function normalizeDate(dateStr) {
  const [y, m, d] = dateStr.split(/[-/]/).map(s => s.padStart(2, '0'));
  return `${y}-${m}-${d}`;
}

/**
 * 📆 指定された日付の予約可能な時間枠を取得
 * null や undefined は「休診日」として扱い、undefined を返す
 */
function getAvailableTimeSlots(dateStr) {
  try {
    if (!fs.existsSync(calendarPath)) {
      console.error('[ERROR] calendar.json が存在しません');
      return undefined;
    }

    const calendarData = JSON.parse(fs.readFileSync(calendarPath, 'utf-8'));
    const normalizedDate = normalizeDate(dateStr);

    const slots = calendarData[normalizedDate];

    // ✅ null や undefined は休診日として扱う
    if (slots === null || typeof slots === 'undefined') {
      return undefined;
    }

    // ✅ 空配列は診察可能だが空き枠なし
    return Array.isArray(slots) ? slots : undefined;
  } catch (err) {
    console.error('[ERROR] calendar.json 読み込み失敗:', err.message);
    return undefined;
  }
}

/**
 * ✅ 指定された日付と時間枠が予約可能かを判定
 */
function isValidReservation(dateStr, timeSlot) {
  const slots = getAvailableTimeSlots(dateStr); // normalizeDate は内部で呼ばれる
  return Array.isArray(slots) && slots.includes(timeSlot);
}

module.exports = {
  getAvailableTimeSlots,
  isValidReservation,
  normalizeDate
};