const {
  registerReservation,
  cancelReservation,
  getReservationsByDate,
  getAvailableSlots
} = require('./reservationService');
const { getAvailableTimeSlots } = require('./calendarUtils');

// 📅 入力された MM/DD を YYYY/MM/DD に変換（スラッシュ形式）
function normalizeDate(input) {
  const today = new Date();
  const year = today.getFullYear();
  const [m, d] = input.split('/');
  return `${year}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
}

async function handleBotMessage(userId, messageText) {
  const tokens = messageText.trim().split(/\s+/);
  const command = tokens[0];

  switch (command) {
    case '予約': {
      const [ , rawDate, time, name, note ] = tokens;
      const date = rawDate.includes('/') ? normalizeDate(rawDate) : rawDate;
      return await registerReservation(userId, date, time, name, note);
    }

    case 'キャンセル': {
      const [ , rawDate, time ] = tokens;
      const date = rawDate.includes('/') ? normalizeDate(rawDate) : rawDate;
      return await cancelReservation(userId, date, time);
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