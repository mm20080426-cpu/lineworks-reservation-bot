require('dotenv').config(); // ローカル用（Renderでは無視される）

const fetch = require('node-fetch'); // ← 追加
const {
  registerReservation,
  cancelReservation,
  getReservationsByDate,
  getReservationsByDateRaw,
  getAvailableSlots
} = require('./reservationService');
const { getAvailableTimeSlots } = require('./calendarUtils');

const cancelContext = new Map();
const SYNC_URL = process.env.SYNC_URL;

if (!SYNC_URL) {
  console.warn('[WARN] SYNC_URL が未定義です。環境変数を確認してください');
}

function extractReservationId(text) {
  const match = text.match(/予約枠ID[:：]?\s*([a-zA-Z0-9\-]{6,})/);
  return match ? match[1].trim() : null;
}

async function handleBotMessage(userId, messageText) {
  console.log('[DEBUG] handleBotMessage 実行開始');

  try {
    const context = cancelContext.get(userId);
    console.log('[DEBUG] 現在のステート:', context);

    if (context?.step === 'awaitingNote') {
      console.log('[DEBUG] entered awaitingNote');
      console.log('[DEBUG] SYNC_URL value:', SYNC_URL);

      const note = messageText.trim();
      const { selectedDate, selectedSlot, name } = context;

      cancelContext.delete(userId);
      const result = await registerReservation(userId, selectedDate, selectedSlot, name, note);

      try {
        const res = await fetch(SYNC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trigger: 'sync' })
        });
        const text = await res.text();
        console.log('✅ カレンダー同期レスポンス:', text);
      } catch (err) {
        console.error('❌ カレンダー同期失敗:', err.message);
        return result + '\n⚠️ カレンダーへの反映に失敗しました。管理者にご確認ください。';
      }

      return result;
    }

    if (context?.step === 'awaitingCancelDate') {
      const selectedDate = messageText.trim();
      const rawReservations = await getReservationsByDateRaw(selectedDate);

      if (rawReservations.length === 0) {
        cancelContext.delete(userId);
        return `📭 ${selectedDate} の予約はありません。`;
      }

      const idMap = {};
      const displayList = rawReservations.map((r, i) => {
        const reservationId = r[0];
        idMap[i + 1] = reservationId;
        return `${i + 1}. 🕒 ${r[2]}｜👤 ${r[4]}｜📝 ${r[5]}｜予約枠ID: ${reservationId}`;
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

    if (context?.step === 'awaitingCancelSelection') {
      const selectedNumber = parseInt(messageText.trim(), 10);
      const { idMap, rawReservations } = context;
      const reservationId = idMap[selectedNumber];

      if (!reservationId) {
        const retryList = rawReservations.map((r, i) => {
          return `${i + 1}. 🕒 ${r[3]}｜👤 ${r[4]}｜📝 ${r[5]}｜予約枠ID: ${r[0]}`;
        });
        return `⚠️ 有効な番号を入力してください。\n📋 最新の予約一覧:\n` + retryList.join('\n');
      }

      const matched = rawReservations.find(r => r[0] === reservationId);
      if (!matched) return '⚠️ 対象の予約が見つかりません。';

      const reservationIdConfirmed = matched[0];
      const selectedDate = matched[2];
      const timeSlot = matched[3];
      const name = matched[4];

      cancelContext.delete(userId);
      const resultText = await cancelReservation(userId, reservationIdConfirmed, selectedDate, timeSlot);

      try {
        const res = await fetch(SYNC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trigger: 'sync' })
        });
        const text = await res.text();
        console.log('✅ カレンダー同期レスポンス:', text);
      } catch (err) {
        console.error('❌ カレンダー同期失敗:', err.message);
      }

      return resultText;
    }

    const tokens = messageText.trim().split(/\s+/);
    const command = tokens[0];

    switch (command) {
      case '予約': {
        cancelContext.set(userId, { step: 'awaitingDate' });
        return '📅 日付を入力してください（例：9/11 または 2025/9/11）';
      }

      case 'キャンセル': {
        cancelContext.set(userId, { step: 'awaitingCancelDate' });
        return '📅 キャンセルしたい日付を入力してください（例：2025/09/10）';
      }

      case '一覧': {
        const [, rawDate] = tokens;
        const date = rawDate?.includes('/') ? rawDate : null;
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

        cancelContext.set(userId, {
          step: 'dateSelected',
          selectedDate: inputDate,
          normalizedDate: inputDate,
          availableSlots: slots
        });

        return `📅 ${inputDate} の空き枠です。番号でお選びください。\n` +
          slots.map((s, i) => `${i + 1}. ${s}`).join('\n');
      }

      default:
        return `❓ コマンドが認識できませんでした。\n以下のコマンドをお試しください：\n- 予約\n- キャンセル\n- 一覧 [日付]\n- 空き [日付]`;
    }
  } catch (err) {
    console.error('[ERROR] handleBotMessage 処理中に例外発生:', err.message);
    return '⚠️ 内部エラーが発生しました。管理者にご確認ください。';
  }
}

module.exports = { handleBotMessage };