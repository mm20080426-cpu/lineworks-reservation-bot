const {
  registerReservation,
  cancelReservation,
  getReservationsByDate,
  getAvailableSlots
} = require('./reservationService');
const { getAvailableTimeSlots } = require('./calendarUtils');

// 📅 MM/DD → YYYY/MM/DD に変換（スラッシュ形式）
function normalizeDate(input) {
  const today = new Date();
  const year = today.getFullYear();
  const [m, d] = input.split('/');
  return `${year}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
}

// 🕒 時間枠の表記を統一（〜/～/~/- → 〜）
function normalizeSlot(slot) {
  return slot.replace(/〜|～|~|-/g, '〜').trim();
}

// 🧠 ユーザーごとのキャンセルステップ管理
const cancelContext = new Map(); // userId → { step, date, reservations }

async function handleBotMessage(userId, messageText) {
  const tokens = messageText.trim().split(/\s+/);
  const command = tokens[0];

  const context = cancelContext.get(userId);

  // 🟡 ステップ式キャンセルフロー
  if (command === 'キャンセル' && !context) {
    cancelContext.set(userId, { step: 'awaiting_date' });
    return '📅 キャンセルしたい日付を入力してください（例：9/10）';
  }

  if (context?.step === 'awaiting_date') {
    const date = normalizeDate(messageText);
    const reservations = await getReservationsByDate(date);
    if (reservations.length === 0) {
      cancelContext.delete(userId);
      return `📭 ${date} の予約はありません。`;
    }
    cancelContext.set(userId, { step: 'awaiting_selection', date, reservations });
    return `🗑 キャンセル対象を番号で選んでください：\n` +
           reservations.map((r, i) => `${i + 1}. ${r}`).join('\n');
  }

  if (context?.step === 'awaiting_selection') {
    const index = parseInt(messageText.trim(), 10) - 1;
    const { date, reservations } = context;
    if (isNaN(index) || !reservations[index]) {
      return '⚠️ 有効な番号を入力してください。';
    }

    const timeSlotMatch = reservations[index].match(/🕒 (.*?)｜/);
    if (!timeSlotMatch) {
      cancelContext.delete(userId);
      return '⚠️ 時間枠の抽出に失敗しました。';
    }

    const timeSlot = normalizeSlot(timeSlotMatch[1]);
    cancelContext.delete(userId);
    return await cancelReservation(userId, date, timeSlot);
  }

  // 🔁 通常コマンド処理
  switch (command) {
    case '予約': {
      const [ , rawDate, time, name, note ] = tokens;
      const date = rawDate.includes('/') ? normalizeDate(rawDate) : rawDate;
      return await registerReservation(userId, date, time, name, note);
    }

    case '一覧': {
      const [ , rawDate ] = tokens;
      const date = rawDate.includes('/') ? normalizeDate(rawDate) : rawDate;
      const list = await getReservationsByDate(date);
      return list.length > 0
        ? `📋 ${date} の予約一覧：\n` + list.join('\n')
        : `📭 ${date} の予約はまだありません。`;
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