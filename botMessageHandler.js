const {
  registerReservation,
  cancelReservation,
  getReservationsByDate,
  getReservationsByDateRaw,
  getAvailableSlots
} = require('./reservationService');
const { getAvailableTimeSlots } = require('./calendarUtils');

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
  if (context?.step === 'awaitingCancelDate') {
    const selectedDate = messageText.trim();
    console.log('[DEBUG] ステップ①で受け取った selectedDate:', selectedDate);

    const rawReservations = await getReservationsByDateRaw(selectedDate);
    console.log('[DEBUG] キャンセル対象日の予約一覧:', rawReservations);

    if (rawReservations.length === 0) {
      cancelContext.delete(userId);
      return `📭 ${selectedDate} の予約はありません。`;
    }

    const idMap = {};
    const displayList = rawReservations.map((r, i) => {
      const reservationId = r[0];
      idMap[i + 1] = reservationId;
      return `${i + 1}. 🕒 ${r[2]}｜👤 ${r[3]}｜📝 ${r[4]}｜予約枠ID: ${reservationId}`;
    });

    cancelContext.set(userId, {
      step: 'awaitingCancelSelection',
      cancelDate: selectedDate,
      idMap,
      rawReservations
    });

    return `🕒 ${selectedDate} のキャンセルしたい予約を番号で選んでください（例：1）\n📋 予約一覧:\n` +
           displayList.join('\n');
  }

// ステップ②：番号選択
if (context?.step === 'awaitingCancelSelection') {
  const selectedNumber = parseInt(messageText.trim(), 10);
  const { idMap, rawReservations, cancelDate } = context;

  const reservationId = idMap[selectedNumber];
  if (!reservationId) {
    const retryList = rawReservations.map((r, i) => {
      return `${i + 1}. 🕒 ${r[3]}｜👤 ${r[4]}｜📝 ${r[5]}｜予約枠ID: ${r[0]}`;
    });
    return `⚠️ 有効な番号を入力してください。\n📋 最新の予約一覧:\n` + retryList.join('\n');
  }

  const matched = rawReservations.find(r => r[0] === reservationId);
  if (!matched) {
    return '⚠️ 対象の予約が見つかりません。';
  }

  // 明示的に列を指定
  const reservationIdConfirmed = matched[0]; // 予約ID
  const selectedDate = matched[2];           // 日付
  const timeSlot = matched[3];               // 時間枠
  const name = matched[4];                   // 名前
  const note = matched[5];                   // 備考

  console.log('[DEBUG] cancelReservation() 呼び出し:', {
    userId,
    reservationId: reservationIdConfirmed,
    selectedDate,
    timeSlot
  });

  cancelContext.delete(userId);
  const result = await cancelReservation(userId, reservationIdConfirmed, selectedDate, timeSlot);

  if (result?.success) {
    return `✅ キャンセルしました：🕒 ${timeSlot}｜👤 ${name}｜📝 ${note}`;
  } else {
    return `⚠️ キャンセルに失敗しました：🕒 ${timeSlot}｜👤 ${name}｜📝 ${note}`;
  }
}

  // 通常コマンド処理
  const tokens = messageText.trim().split(/\s+/);
  const command = tokens[0];

  switch (command) {
    case '予約': {
      const [, rawDate, time, name, note] = tokens;
      const date = rawDate.includes('/') ? rawDate : null;
      return await registerReservation(userId, date, time, name, note);
    }

    case 'キャンセル': {
      cancelContext.set(userId, { step: 'awaitingCancelDate' });
      return '📅 キャンセルしたい日付を入力してください（例：2025/09/10）';
    }

    case '一覧': {
      const [, rawDate] = tokens;
      const date = rawDate.includes('/') ? rawDate : null;
      const list = await getReservationsByDate(date);
      return list.length > 0
        ? list.map(r => `🕒 ${r[2]}｜👤 ${r[3]}｜📝 ${r[4]}｜予約枠ID: ${r[0]}`).join('\n')
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