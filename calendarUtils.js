const fs = require('fs');
const path = require('path');

const calendarPath = path.join(__dirname, 'calendar.json');

/**
 * 📅 日付を "YYYY-MM-DD" 形式に統一する
 * calendar.json のキーと一致させるため、区切りを "-" に統一
 */
function normalizeDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const parts = dateStr.trim().split(/[-/]/);
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  console.warn('[WARN] normalizeDate: 日付形式が不正です:', dateStr);
  return '';
}

/**
 * 🧼 時間枠の表記を統一（例：09:00〜09:15）
 * 順序が逆の場合は入れ替える
 */
function normalizeSlot(slot) {
  if (!slot || typeof slot !== 'string') return '';
  const cleaned = slot.replace(/〜|～|~|-/g, '〜').trim();
  const match = cleaned.match(/(\d{1,2}:\d{2})〜(\d{1,2}:\d{2})/);
  if (match) {
    const [ , start, end ] = match;
    return start < end ? `${start}〜${end}` : `${end}〜${start}`;
  }
  console.warn('[WARN] normalizeSlot: 時間枠形式が不正です:', slot);
  return cleaned;
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

    if (!normalizedDate) {
      console.warn('[WARN] getAvailableTimeSlots: 日付の正規化に失敗しました:', dateStr);
      return undefined;
    }

    const slots = calendarData[normalizedDate];

    if (slots === null || typeof slots === 'undefined') {
      console.log(`[INFO] ${normalizedDate} は休診日です`);
      return undefined;
    }

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
  const slots = getAvailableTimeSlots(dateStr);
  const normalizedSlot = normalizeSlot(timeSlot);
  return Array.isArray(slots) && slots.includes(normalizedSlot);
}

module.exports = {
  getAvailableTimeSlots,
  isValidReservation,
  normalizeDate,
  normalizeSlot
};