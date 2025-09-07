const fs = require('fs');
const path = require('path');

const calendarPath = path.join(__dirname, 'calendar.json');

/**
 * 📅 日付を "YYYY-MM-DD" 形式に統一する
 */
function normalizeDate(dateStr) {
  const [y, m, d] = dateStr.split(/[-/]/).map(s => s.padStart(2, '0'));
  return `${y}-${m}-${d}`;
}

/**
 * 📆 指定された日付の予約可能な時間枠を取得
 */
function getAvailableTimeSlots(dateStr) {
  try {
    if (!fs.existsSync(calendarPath)) {
      console.error('[ERROR] calendar.json が存在しません');
      return [];
    }

    const calendarData = JSON.parse(fs.readFileSync(calendarPath, 'utf-8'));
    const normalizedDate = normalizeDate(dateStr);
    return calendarData[normalizedDate] ?? [];
  } catch (err) {
    console.error('[ERROR] calendar.json 読み込み失敗:', err.message);
    return [];
  }
}

/**
 * ✅ 指定された日付と時間枠が予約可能かを判定
 */
function isValidReservation(dateStr, timeSlot) {
  const slots = getAvailableTimeSlots(dateStr); // normalizeDate は内部で呼ばれる
  return slots.includes(timeSlot);
}

module.exports = {
  getAvailableTimeSlots,
  isValidReservation,
  normalizeDate // 他のモジュールでも使えるように export
};