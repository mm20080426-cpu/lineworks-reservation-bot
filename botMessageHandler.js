const {
  registerReservation,
  cancelReservation,
  getReservationsByDate,
  getAvailableSlots
} = require('./reservationService');
const { getAvailableTimeSlots } = require('./calendarUtils');

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

// ✅ 時間枠抽出（番号付き・ハイフン対応）
function extractTimeSlot(text) {
  const match = text.match(/(\d{1,2}:\d{2})\s*[〜～~\-]\s*(\d{1,2}:\d{2})/);
  if (match) {
    const [ , start, end ] = match;
    return normalizeSlot(`${start}〜${end}`);
  }
  return null;
}

// ✅ 予約枠ID抽出（英数字＋ハイフン対応）
function extractReservationId(text) {
  const match = text.match(/予約枠ID[:：]?\s*([a-f0-9]{12})/i);
  return match ? match[1].trim() : null;
}

// ✅ 日付抽出（年付き）
function extractDate(text) {
  const match = text.match(/(\d{4}\/\d{2}\/\d{2})/);
  return match ? match[1] : null;
}

const cancelContext = new Map(); // userId → { step, reservations }

async function handleBotMessage(userId, messageText) {
  const context = cancelContext.get(userId);

  // 🟡 ステップ式キャンセル処理
  if (context?.step === 'awaiting_date') {
    try {
      const rawList = await getReservationsByDate(messageText);

      console.log('[DEBUG] 入力された日付:', messageText);
      console.log('[DEBUG] getReservationsByDate の戻り値:', rawList);

      if (!rawList || rawList.length === 0) {
        cancelContext.delete(userId);
        return `📭 ${messageText} の予約はありません。`;
      }

      const reservations = rawList.map((r) => {
        const reservationId = extractReservationId(r);
        const timeSlot = extractTimeSlot(r);
        const date = extractDate(r);

        console.log('[DEBUG] 抽出結果:', { raw: r, reservationId, timeSlot, date });

        if (!reservationId || !timeSlot || !date) {
          console.warn('[WARN] 抽出失敗:', { raw: r });
          return null;
        }

        return {
          display: r,
          reservationId,
          timeSlot,
          date
        };
      }).filter(Boolean);

      cancelContext.set(userId, { step: 'awaiting_selection', reservations });

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
    const { reservations } = context;
    if (isNaN(index) || !reservations[index]) {
      return '⚠️ 有効な番号を入力してください。';
    }

    const selected = reservations[index];

    console.log('[DEBUG] 選択された予約オブジェクト:', selected);

    cancelContext.delete(userId);

    if (!selected.reservationId) {
      console.warn('[WARN] reservationIdが抽出できませんでした:', selected.display);
      return `⚠️ 選択された予約から予約枠IDを取得できませんでした。\n表示形式をご確認ください。`;
    }

    if (!selected.timeSlot || !selected.date) {
      return '⚠️ キャンセル対象の情報が不完全です。';
    }

    console.log('[DEBUG] キャンセル照合対象:', {
      reservationId: selected.reservationId,
      date: selected.date,
      timeSlot: selected.timeSlot
    });

    return await cancelReservation(userId, selected.reservationId, selected.date, selected.timeSlot);
  }

  // 🔁 通常コマンド処理
  const tokens = messageText.trim().split(/\s+/);
  const command = tokens[0];

  switch (command) {
    case '予約': {
      const [ , rawDate, time, name, note ] = tokens;
      const date = rawDate.includes('/') ? rawDate : null;
      return await registerReservation(userId, date, time, name, note);
    }

    case 'キャンセル': {
      cancelContext.set(userId, { step: 'awaiting_date' });
      return '📅 キャンセルしたい日付を入力してください（例：2025/09/10）';
    }

    case '一覧': {
      const [ , rawDate ] = tokens;
      const date = rawDate.includes('/') ? rawDate : null;
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