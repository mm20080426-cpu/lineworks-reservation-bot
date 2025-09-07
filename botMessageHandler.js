const {
  registerReservation,
  cancelReservation,
  getReservationsByDate,
  getAvailableSlots
} = require('./reservationService');
const { getAvailableTimeSlots } = require('./calendarUtils');

function normalizeDate(input) {
  // 例: '9/12' → '2025-09-12'
  const today = new Date();
  const year = today.getFullYear();
  const [m, d] = input.split('/');
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

async function handleBotMessage(userId, messageText) {
  const tokens = messageText.trim().split(/\s+/);
  const command = tokens[0];

  switch (command) {
    case '予約': {
      const [ , date, time, name, note ] = tokens;
      return await registerReservation(userId, date, time, name, note);
    }

    case 'キャンセル': {
      const [ , cancelDate, cancelTime ] = tokens;
      return await cancelReservation(userId, cancelDate, cancelTime);
    }

    case '一覧': {
      const [ , listDate ] = tokens;
      const list = await getReservationsByDate(listDate);
      return list.length > 0
        ? `📋 ${listDate} の予約一覧：\n` + list.join('\n')
        : `📭 ${listDate} の予約はまだありません。`;
    }

    case '空き': {
      let inputDate = tokens[1];

      // ✅ 日付が指定されていない場合は今日の日付を使う
      if (!inputDate) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        inputDate = `${yyyy}-${mm}-${dd}`;
      } else if (inputDate.includes('/')) {
        inputDate = normalizeDate(inputDate);
      }

      const slots = await getAvailableSlots(inputDate);
      const calendarData = getAvailableTimeSlots(inputDate);

      if (!calendarData) {
        return `🏥 ${inputDate.replace(/-/g, '/')} は休診日です。`;
      }

      return slots.length > 0
        ? `🈳 ${inputDate.replace(/-/g, '/')} の空き枠：\n` + slots.map(s => `🕒 ${s}`).join('\n')
        : `😢 ${inputDate.replace(/-/g, '/')} はすべて埋まっています。`;
    }

    default:
      return `❓ コマンドが認識できませんでした。\n「予約」「キャンセル」「一覧」「空き」などを使ってください。`;
  }
}

module.exports = { handleBotMessage };