const {
  registerReservation,
  cancelReservation,
  getReservationsByDate,
  getReservationsByDateRaw,
  getAvailableSlots
} = require('./reservationService');
const { getAvailableTimeSlots } = require('./calendarUtils');

// 正規化：時間枠の順序を保証
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
  if (!text || typeof text !== 'string') return null;
  const cleaned = text.replace(/\s/g, '').replace(/[～~\-]/g, '〜');
  const match = cleaned.match(/(\d{1,2}:\d{2})〜(\d{1,2}:\d{2})/);
  if (match) {
    const [ , start, end ] = match;
    return start < end ? `${start}〜${end}` : `${end}〜${start}`;
  }
  return null;
}

// 予約枠ID抽出
function extractReservationId(text) {
  const match = text.match(/予約枠ID[:：]?\s*([a-zA-Z0-9\-]{6,})/);
  return match ? match[1].trim() : null;
}

// 🔧 構造化保証関数（ログ付き）
function ensureStructuredList(rawList, selectedDate) {
  console.log('[DEBUG] ensureStructuredList に渡された selectedDate:', selectedDate);
  return rawList.map((item, i) => {
    if (typeof item === 'string') {
      const timeSlot = extractTimeSlot(item);
      const reservationId = extractReservationId(item);
      const structured = {
        reservationId,
        timeSlot,
        selectedDate,
        display: item
      };
      console.log(`[DEBUG] 構造化再構築 [${i}]:`, structured);
      return structured;
    }
    return item;
  });
}

const cancelContext = new Map();

async function handleBotMessage(userId, messageText) {
  console.log('[DEBUG] handleBotMessage 実行開始');
  const context = cancelContext.get(userId);
  console.log('[DEBUG] 現在のステート:', context);

  // ステップ①：キャンセル日付入力
  if (context?.step === 'awaitingCancelDate') {
    const selectedDate = messageText.trim();
    console.log('[DEBUG] ステップ①で受け取った selectedDate:', selectedDate);

    const rawReservations = await getReservationsByDateRaw(selectedDate);
    console.log('[DEBUG] getReservationsByDateRaw - filtered:', rawReservations);

    if (rawReservations.length === 0) {
      cancelContext.delete(userId);
      return `📭 ${selectedDate} の予約はありません。`;
    }

    const originalList = rawReservations.map((r, i) => {
      const reservationId = r[0];
      const timeSlot = r[3];
      const name = r[4];
      const note = r[5];
      return `🕒 ${timeSlot}｜👤 ${name}｜📝 ${note}｜予約枠ID: ${reservationId}`; // ← 構造体ではなく文字列のみ
    });

    console.log('[DEBUG] originalList display配列:', JSON.stringify(originalList, null, 2));

    cancelContext.set(userId, {
      step: 'awaitingCancelSelection',
      selectedDate,
      originalList
    });

    return `🕒 ${selectedDate} のキャンセルしたい予約を番号で選んでください（例：1）\n📋 予約一覧:\n` +
           originalList.map((r, i) => `${i + 1}. ${r}`).join('\n');
  }

  // ステップ②：番号選択
  if (context?.step === 'awaitingCancelSelection') {
    const index = parseInt(messageText.trim(), 10) - 1;
    let { originalList, selectedDate } = context;

    console.log('[DEBUG] ステップ② selectedDate:', selectedDate);

    if (isNaN(index) || !originalList[index]) {
      return '⚠️ 有効な番号を入力してください。';
    }

    // 🔧 構造化保証（防御的再構築）
    originalList = ensureStructuredList(originalList, selectedDate);
    const selectedRaw = originalList[index];

    console.log('[DEBUG] selectedRaw:', JSON.stringify(selectedRaw, null, 2));

    if (typeof selectedRaw !== 'object' || !selectedRaw.selectedDate) {
      console.warn('[WARN] selectedRaw の型が不正です:', selectedRaw);
      return '⚠️ キャンセル対象の情報が不正です。再度選択してください。';
    }

    const { reservationId, timeSlot, display } = selectedRaw;

    cancelContext.delete(userId);

    if (!reservationId || !timeSlot || !selectedDate) {
      console.warn('[WARN] キャンセル対象の情報が不完全です:', {
        reservationId,
        timeSlot,
        selectedDate,
        display
      });
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
      cancelContext.set(userId, { step: 'awaitingCancelDate' });
      return '📅 キャンセルしたい日付を入力してください（例：2025/09/10）';
    }

    case '一覧': {
      const [ , rawDate ] = tokens;
      const date = rawDate.includes('/') ? rawDate : null;
      const list = await getReservationsByDate(date);
      return list.length > 0
        ? list.map(r => `🕒 ${r[3]}｜👤 ${r[4]}｜📝 ${r[5]}｜予約枠ID: ${r[0]}`).join('\n')
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