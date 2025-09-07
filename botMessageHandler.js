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
  let availableDate = tokens[1];

  // ✅ 日付が指定されていない場合は今日の日付を使用
  if (!availableDate) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    availableDate = `${yyyy}-${mm}-${dd}`; // 例: '2025-09-07'
  }

  const slots = await getAvailableSlots(availableDate);
  return slots.length > 0
    ? `🈳 ${availableDate.replace(/-/g, '/')} の空き枠：\n` + slots.map(s => `🕒 ${s}`).join('\n')
    : `😢 ${availableDate.replace(/-/g, '/')} はすべて埋まっています。`;
}

    default:
      return `❓ コマンドが認識できませんでした。\n「予約」「キャンセル」「一覧」「空き」などを使ってください。`;
  }
}

module.exports = { handleBotMessage };