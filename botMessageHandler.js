const {
  registerReservation,
  cancelReservation,
  getReservationsByDate,
  getAvailableSlots
} = require('./reservationService');
const { getAvailableTimeSlots } = require('./calendarUtils');

// 日付を YYYY/MM/DD に整形
function normalizeDate(input) {
  const today = new Date();
  const year = today.getFullYear();
  const [m, d] = input.split('/');
  return `${year}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
}

// 時間枠を正規化（順序入れ替え含む）
function normalizeSlot(slot) {
  const cleaned = slot.replace(/〜|～|~|-/g, '〜').trim();
  const match = cleaned.match(/(\d{1,2}:\d{2})〜(\d{1,2}:\d{2})/);
  if (match) {
    const [start, end] = match.slice(1);
    return start < end ? `${start}〜${end}` : `${end}〜${start}`;
  }
  return cleaned;
}

// 時間枠抽出
function extractTimeSlot(text) {
  const match = text.match(/🕒 (.*?)｜/);
  return match ? normalizeSlot(match[1]) : null;
}

// 予約枠ID抽出
function extractReservationId(text) {
  const match = text.match(/予約枠ID[:：]?\s*(\d+)/);
  return match ? match[1] : null;
}

const cancelContext = new Map(); // userId → { step, date, reservations }

async function handleBotMessage(userId, messageText) {
  const context = cancelContext.get(userId);

  // 🟡 ステップ式キャンセル処理
  if (context?.step === 'awaiting_date') {
    try {
      const date = normalizeDate(messageText);
      const rawList = await getReservationsByDate(date);

      console.log('[DEBUG] 入力された日付:', messageText);
      console.log('[DEBUG] 正規化された日付:', date);
      console.log('[DEBUG] getReservationsByDate の戻り値:', rawList);

      if (!rawList || rawList.length === 0) {
        cancelContext.delete(userId);
        return `📭 ${date} の予約はありません。`;
      }

      // 抽出済みリストを構造化
      const reservations = rawList.map((r) => ({
        display: r,
        timeSlot: extractTimeSlot(r),
        reservationId: extractReservationId(r)
      }));

      cancelContext.set(userId, { step: 'awaiting_selection', date, reservations });

      return `🗑 キャンセル対象を番号で選んでください：\n` +
             reservations.map((r, i) => `${i + 1}. ${r.display}`).join('\n');
    } catch (err) {
      console.error('[ERROR] キャンセル処理中の例外:', err);
      cancelContext.delete(userId);
      return '⚠️ キャンセル処理中にエラーが発生しました。';
    }
  }

  if (context?.step === 'awaiting_selection') {
    const index = parseInt(messageText.trim(), 10) - 1;
    const { date, reservations } = context;
    if (isNaN(index) || !reservations[index]) {
      return '⚠️ 有効な番号を入力してください。';
    }

    const selected = reservations[index];

    console.log('[DEBUG] 選択された予約:', selected.display);
    console.log('[DEBUG] 抽出された時間枠:', selected.timeSlot);
    console.log('[DEBUG] 抽出された予約枠ID:', selected.reservationId);

    cancelContext.delete(userId);

    if (!selected.reservationId || !selected.timeSlot) {
      return '⚠️ キャンセル対象の情報が不完全です。';
    }

    return await cancelReservation(userId, selected.reservationId, date, selected.timeSlot);
  }

  // 🔁 通常コマンド処理
  const tokens = messageText.trim().split(/\s+/);
  const command = tokens[0];

  switch (command) {
    case '予約': {
      const [ , rawDate, time, name, note ] = tokens;
      const date = rawDate.includes('/') ? normalizeDate(rawDate) : rawDate;
      return await registerReservation(userId, date, time, name, note);
    }

    case 'キャンセル': {
      cancelContext.set(userId, { step: 'awaiting_date' });
      return '📅 キャンセルしたい日付を入力してください（例：9/10）';
    }

    case '一覧': {
      const [ , rawDate ] = tokens;
      const date = rawDate.includes('/') ? normalizeDate(rawDate) : rawDate;
      const list = await getReservationsByDate(date);
      return list.length > 0
        ? list.join('\n')
        : `📭 ${date} の予約はありません。`;
    }

    case '空き': {
      let inputDate = tokens[1];

      if (!inputDate) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        inputDate = `${yyyy}/${mm}/${dd}`;
      } else if (inputDate.includes('/')) {
        inputDate = normalizeDate(inputDate);
      }

      const slots = await getAvailableSlots(inputDate);
      const calendarData = getAvailableTimeSlots(inputDate);

      if (!calendarData || calendarData.length === 0) {
        return `🏥 ${inputDate} は休診日です。`;
      }

      return slots.length > 0
        ? `🈳 ${inputDate} の空き枠です。番号でお選びください：\n` +
          slots.map((s, i) => `${i + 1}. ${s}`).join('\n')
        : `😢 ${inputDate} はすべて埋まっています。`;
    }

    default:
      return `❓ コマンドが認識できませんでした。\n「予約」「キャンセル」「一覧」「空き」などを使ってください。`;
  }
}

module.exports = { handleBotMessage };