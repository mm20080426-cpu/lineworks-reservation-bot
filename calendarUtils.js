const fs = require('fs');
const path = require('path');

const calendarPath = path.join(__dirname, 'calendar.json');
let calendarCache = null;

/** 📅 日付を "YYYY-MM-DD" 形式に統一 */
function normalizeDate(dateStr) {
  if (!dateStr) return '';
  if (dateStr instanceof Date) {
    const y = dateStr.getFullYear();
    const m = String(dateStr.getMonth() + 1).padStart(2, '0');
    const d = String(dateStr.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  if (typeof dateStr === 'string') {
    const parts = dateStr.trim().split(/[-/]/);
    if (parts.length === 3) {
      const [y, m, d] = parts;
      return `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  console.warn('[WARN] normalizeDate: 日付形式が不正です:', dateStr);
  return '';
}

/** 🧼 時間枠の表記を統一（例：09:00〜09:15） */
function normalizeSlot(slot) {
  if (!slot || typeof slot !== 'string') return '';
  const cleaned = slot.replace(/〜|～|~|-/g, '〜').trim();
  const match = cleaned.match(/(\d{1,2}:\d{2})〜(\d{1,2}:\d{2})/);
  if (match) {
    const [ , start, end ] = match;
    return start < end ? `${start}〜${end}` : `${end}〜${start}`;
  }
  return cleaned;
}

/** 📥 calendar.json をキャッシュに読み込む（Bot起動時に呼び出し） */
function loadCalendarCache() {
  try {
    const raw = fs.readFileSync(calendarPath, 'utf-8');
    calendarCache = JSON.parse(raw);
    console.log('[INFO] calendar.json をキャッシュしました');
  } catch (err) {
    console.error('[ERROR] calendar.json キャッシュ失敗:', err.message);
  }
}

/** 📆 指定された日付の予約可能な時間枠を取得（キャッシュ使用） */
function getAvailableTimeSlots(dateStr) {
  const normalizedDate = normalizeDate(dateStr);
  if (!normalizedDate || !calendarCache) return undefined;

  const slots = calendarCache[normalizedDate];
  if (!slots) {
    console.log(`[INFO] ${normalizedDate} は休診日です`);
    return undefined;
  }

  return Array.isArray(slots) ? slots : undefined;
}

/** ✅ 指定された日付と時間枠が予約可能かを判定 */
function isValidReservation(dateStr, timeSlot) {
  const slots = getAvailableTimeSlots(dateStr);
  const normalizedSlot = normalizeSlot(timeSlot);
  return Array.isArray(slots) && slots.includes(normalizedSlot);
}

module.exports = {
  getAvailableTimeSlots,
  isValidReservation,
  normalizeDate,
  normalizeSlot,
  loadCalendarCache
};