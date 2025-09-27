const fs = require('fs');
const path = require('path');

const calendarPath = path.join(__dirname, 'calendar.json');

/** 📅 日付を "YYYY-MM-DD" 形式に統一 */
function normalizeDate(dateInput) { // 引数名を dateInput に変更して型を明確に
  if (!dateInput) return '';

  // Dateオブジェクトの場合
  if (dateInput instanceof Date) {
    const y = dateInput.getFullYear();
    const m = String(dateInput.getMonth() + 1).padStart(2, '0');
    const d = String(dateInput.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 数値（Excelシリアル値）の場合
  if (typeof dateInput === 'number') {
    // Excelの基準日は1900年1月1日 (ただしExcelは1900年2月29日を存在すると誤解釈しているため、調整が必要)
    // JavaScriptのDateは1900年1月0日が基準（シリアル値0）
    const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // 1899/12/30がExcelシリアル値0
    const date = new Date(excelEpoch.getTime() + dateInput * 24 * 60 * 60 * 1000);
    // タイムゾーンオフセットを考慮して、現地の0時に調整
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 文字列の場合
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    // YYYY/MM/DD, YYYY-MM-DD, MM/DD の形式を処理
    const fullMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    const shortMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})$/);

    let y, m, d;
    if (fullMatch) {
      [ , y, m, d ] = fullMatch;
    } else if (shortMatch) {
      [ , m, d ] = shortMatch;
      y = new Date().getFullYear(); // 年を補完
    } else {
      // 不明な文字列形式は不正
      console.warn('[WARN] normalizeDate: 不明な文字列日付形式です:', dateInput);
      return '';
    }

    // Dateオブジェクトとして有効かチェック
    const testDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    if (isNaN(testDate.getTime())) {
      console.warn('[WARN] normalizeDate: 無効な日付値です:', dateInput);
      return '';
    }

    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  console.warn('[WARN] normalizeDate: 日付形式が不正です:', dateInput);
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
  return cleaned; // 不正形式でもそのまま返す（警告は呼び出し元で判断）
}

/** 📆 指定された日付の予約可能な時間枠を取得 */
function getAvailableTimeSlots(dateStr) {
  try {
    if (!fs.existsSync(calendarPath)) {
      console.error('[ERROR] calendar.json が存在しません:', calendarPath);
      return undefined;
    }

    const raw = fs.readFileSync(calendarPath, 'utf-8');
    const calendarData = JSON.parse(raw);
    const normalizedDate = normalizeDate(dateStr);

    if (!normalizedDate) {
      console.warn('[WARN] getAvailableTimeSlots: 日付の正規化に失敗:', dateStr);
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

/** ✅ 指定された日付と時間枠が予約可能かを判定 */
function isValidReservation(dateStr, timeSlot) {
  const slots = getAvailableTimeSlots(dateStr);
  const normalizedSlot = normalizeSlot(timeSlot);
  const result = Array.isArray(slots) && slots.includes(normalizedSlot);
  return result;
}

module.exports = {
  getAvailableTimeSlots,
  isValidReservation,
  normalizeDate,
  normalizeSlot
};