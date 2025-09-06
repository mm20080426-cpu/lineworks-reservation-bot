const fs = require('fs');
const path = require('path');

const calendarPath = path.join(__dirname, 'calendar.json');

/**
 * 指定された日付の予約可能な時間枠を取得
 */
function getAvailableTimeSlots(dateStr) {
  try {
    const calendarData = JSON.parse(fs.readFileSync(calendarPath, 'utf-8'));
    return calendarData[dateStr] ?? null;
  } catch (err) {
    console.error('[ERROR] calendar.json 読み込み失敗:', err.message);
    return null;
  }
}

/**
 * 指定された日付と時間枠が予約可能かを判定
 */
function isValidReservation(dateStr, timeSlot) {
  const slots = getAvailableTimeSlots(dateStr);
  if (!slots || slots.length === 0) return false;
  return slots.includes(timeSlot);
}

module.exports = { getAvailableTimeSlots, isValidReservation };