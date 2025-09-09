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

// 時間枠抽出（柔軟な記号対応）
function extractTimeSlot(text) {
  if (!text || typeof text !== 'string') return null;

  // 全角・半角スペースを除去し、記号を統一
  const cleaned = text.replace(/\s/g, '').replace(/[～~\-]/g, '〜');

  // 時間枠の抽出（例: 09:15〜09:30）
  const match = cleaned.match(/(\d{1,2}:\d{2})〜(\d{1,2}:\d{2})/);
  if (match) {
    const [ , start, end ] = match;
    // 時間順が逆でも並び替え
    return start < end ? `${start}〜${end}` : `${end}〜${start}`;
  }

  return null;
}

// 予約枠ID抽出（柔軟化：6文字以上の英数字＋ハイフン）
function extractReservationId(text) {
  const match = text.match(/予約枠ID[:：]?\s*([a-zA-Z0-9\-]{6,})/);
  return match ? match[1].trim() : null;
}

const cancelContext = new Map();

async function handleBotMessage(userId, messageText) {
  console.log('[DEBUG] handleBotMessage 実行開始');
  const context = cancelContext.get(userId);
  console.log('[DEBUG] 現在のステート:', context);

  // ステップ①：キャンセル日付入力
  if (context?.step === 'awaiting_date') {
    try {
      const rawList = await getReservationsByDate(messageText);
      console.log('[DEBUG] getReservationsByDate の戻り値:', rawList);

      if (!rawList || rawList.length === 0) {
        cancelContext.delete(userId);
        return `📭 ${messageText} の予約はありません。`;
      }

      const cancelDate = messageText.trim();

      const originalList = rawList.map((r) => {
        const reservationId = extractReservationId(r);
        const timeSlot = extractTimeSlot(r);

        if (!reservationId || !timeSlot) {
          console.warn('[WARN] 構造化失敗:', { raw: r });
          return null;
        }

        return {
          reservationId,
          timeSlot,
          display: r
        };
      }).filter(Boolean);

      console.log('[DEBUG] originalList 構造化結果:', originalList);

      cancelContext.set(userId, {
        step: 'awaitingCancelSelection',
        cancelDate,
        originalList
      });

      return `🗑 キャンセル対象を番号で選んでください：\n` +
             originalList.map((r, i) => `${i + 1}. ${r.display}`).join('\n');
    } catch (err) {
      console.error('[ERROR] キャンセル処理中の例外:', err);
      cancelContext.delete(userId);
      return '⚠️ キャンセル処理中にエラーが発生しました。';
    }
  }

  // ステップ②：番号選択
  if (context?.step === 'awaitingCancelSelection') {
    const index = parseInt(messageText.trim(), 10) - 1;
    const { originalList, cancelDate } = context;

    if (isNaN(index) || !originalList[index]) {
      return '⚠️ 有効な番号を入力してください。';
    }

    const selectedRaw = originalList[index];
    console.log('[DEBUG] 選択された raw データ:', selectedRaw);
    console.log('[DEBUG] selectedRaw の型:', typeof selectedRaw);

    let reservationId, timeSlot, display;

    if (typeof selectedRaw === 'string') {
      reservationId = extractReservationId(selectedRaw);
      timeSlot = extractTimeSlot(selectedRaw);
      display = selectedRaw;
    } else {
      reservationId = selectedRaw.reservationId;
      timeSlot = selectedRaw.timeSlot;
      display = selectedRaw.display;
    }

    const selectedDate = cancelDate;

    console.log('[DEBUG] 選択された予約情報:', {
      index: index + 1,
      reservationId,
      timeSlot,
      selectedDate,
      display
    });

    console.log('[DEBUG] cancelReservation() に渡す引数:', {
      userId,
      reservationId,
      selectedDate,
      timeSlot
    });

    cancelContext.delete(userId);

    if (!reservationId || !timeSlot || !selectedDate) {
      console.warn('[WARN] キャンセル対象の情報が不完全です:', display);
      return '⚠️ キャンセル対象の情報が不完全です。';
    }

    return await cancelReservation(userId, reservationId, selectedDate, timeSlot);
  }

  // 通常コマンド処理
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