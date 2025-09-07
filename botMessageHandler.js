const {
  registerReservation,
  cancelReservation,
  getReservationsByDate,
  getAvailableSlots
} = require('./reservationService');

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
      const [ , availableDate ] = tokens;
      const slots = await getAvailableSlots(availableDate);
      return slots.length > 0
        ? `🈳 ${availableDate} の空き枠：\n` + slots.join('\n')
        : `😢 ${availableDate} はすべて埋まっています。`;
    }

    default:
      return `❓ コマンドが認識できませんでした。\n「予約」「キャンセル」「一覧」「空き」などを使ってください。`;
  }
}

module.exports = { handleBotMessage };