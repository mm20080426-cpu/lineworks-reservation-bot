const { registerReservation, cancelReservation, getReservationsByDate, getReservationsByDateRaw, getAvailableSlots } = require('./reservationService');
const { getAvailableTimeSlots } = require('./calendarUtils');

const userContext = new Map();
const SYNC_URL = process.env.SYNC_URL;
const CALENDAR_URL = 'https://calendar.google.com/calendar/embed?src=santamarialineworks%40gmail.com&ctz=Asia%2FTokyo';
const fetch = require('node-fetch');

function extractDate(text) {
  const full = text.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?/);
  const short = text.match(/(\d{1,2})[\/月](\d{1,2})日?/);
  const yyyy = full ? full[1] : new Date().getFullYear();
  const mm = (full ? full[2] : short?.[1])?.padStart(2, '0');
  const dd = (full ? full[3] : short?.[2])?.padStart(2, '0');
  return yyyy && mm && dd ? `${yyyy}/${mm}/${dd}` : null;
}

function extractTime(text) {
  const match = text.match(/(\d{1,2}:\d{2}〜\d{1,2}:\d{2})/);
  return match ? match[1] : null;
}

async function syncCalendar() {
  if (!SYNC_URL) return;
  try {
    const res = await fetch(SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'sync' })
    });
    const text = await res.text();
    console.log('✅ カレンダー同期:', text);
  } catch (err) {
    console.error('❌ カレンダー同期失敗:', err.message);
  }
}

async function handleBotMessage(userId, messageText) {
  const state = userContext.get(userId);
  const trimmed = messageText.trim();

  // 開始コマンド
if (trimmed === '開始') {
  userContext.set(userId, { step: 'menu' });
  return '✅ おまたせしました！以下のメニューから選んでください♪：\n・予約\n・キャンセル\n・一覧\n・空き\n※ 文字で入力してください（例：「予約」）\n\n📅 予約一覧はこちらから確認できます♪：\n' + CALENDAR_URL;
}

  // メニュー選択
  if (!state || !state.step || state.step === 'menu') {
    switch (trimmed) {
      case '予約':
        userContext.set(userId, { step: 'awaitingDate' });
        return '📅 日付を入力してください（例：9/11 または 2025/9/11）';
      case 'キャンセル':
        userContext.set(userId, { step: 'awaitingCancelDate' });
        return '📅 キャンセルしたい日付を入力してください（例：9/11）';
      case '一覧':
        userContext.set(userId, { step: 'awaitingListDate' });
        return '📅 一覧を表示したい日付を入力してください（例：9/11）';
      case '空き':
        userContext.set(userId, { step: 'awaitingFreeDate' });
        return '📅 空き状況を確認したい日付を入力してください（例：9/11）';
      default:
        return '🤖 「予約」「キャンセル」「一覧」「空き」から選んでください。';
    }
  }

  // 予約フロー
  if (state.step === 'awaitingDate') {
    const date = extractDate(trimmed);
    if (!date) return '⚠️ 日付形式が不正です。';
    const slots = await getAvailableSlots(date);
    const calendarSlots = getAvailableTimeSlots(date);
    const filtered = calendarSlots?.filter(s => slots.includes(s.replace(/〜|～|-/g, '〜').trim())) || [];
    if (filtered.length === 0) return `🚫 ${date} は空き枠がありません。`;
    userContext.set(userId, { step: 'dateSelected', selectedDate: date, availableSlots: filtered });
    return `📅 ${date} の空き枠です。番号で選んでください：\n` + filtered.map((s, i) => `${i + 1}. ${s}`).join('\n');
  }

  if (state.step === 'dateSelected' && /^\d+$/.test(trimmed)) {
    const index = parseInt(trimmed) - 1;
    const slot = state.availableSlots[index];
    if (!slot) return '⚠️ 有効な番号を選んでください。';
    userContext.set(userId, { ...state, step: 'awaitingName', selectedSlot: slot });
    return `✅ ${state.selectedDate} の ${slot} を選択しました。\n👤 お名前を入力してください。`;
  }

  if (state.step === 'awaitingName') {
    userContext.set(userId, { ...state, step: 'awaitingNote', name: trimmed });
    return '📝 備考があれば入力してください（未入力でもOKです）。';
  }

  if (state.step === 'awaitingNote') {
    const note = trimmed || 'なし';
    const result = await registerReservation(userId, state.selectedDate, state.selectedSlot, state.name, note);
    await syncCalendar();
    userContext.delete(userId);
    return `${result}\n\n📅 予約一覧はこちらから確認できます♪：\n${CALENDAR_URL}`;
  }

  // キャンセルフロー
  if (state.step === 'awaitingCancelDate') {
    const date = extractDate(trimmed);
    const raw = await getReservationsByDateRaw(date);
    if (!raw.length) {
      userContext.delete(userId);
      return `📭 ${date} の予約はありません。`;
    }
    const idMap = {};
    const list = raw.map((r, i) => {
      idMap[i + 1] = r[0];
      return `${i + 1}. 🕒 ${r[2]}｜👤 ${r[4]}｜📝 ${r[5]}｜予約枠ID: ${r[0]}`;
    });
    userContext.set(userId, { step: 'awaitingCancelSelection', cancelDate: date, idMap, raw });
    return `🕒 ${date} のキャンセル対象を番号で選んでください：\n` + list.join('\n');
  }

  if (state.step === 'awaitingCancelSelection') {
    const index = parseInt(trimmed);
    const id = state.idMap[index];
    const matched = state.raw.find(r => r[0] === id);
    if (!matched) return '⚠️ 有効な番号を選んでください。';
    const result = await cancelReservation(userId, matched[0], matched[2], matched[3]);
    await syncCalendar();
    userContext.delete(userId);
    return `${result}\n\n📅 予約一覧はこちらから確認できます♪：\n${CALENDAR_URL}`;
  }

  // 一覧表示
if (state.step === 'awaitingListDate') {
  const date = extractDate(trimmed);
  const list = await getReservationsByDate(date);
  userContext.delete(userId);
  return list.length
    ? `📋 ${date} の予約一覧：\n` + list.map(r => r.replace(/予約[枠]?ID[:：].*$/, '').trim()).join('\n') + `\n\n📅 予約一覧はこちらから確認できます♪：\n${CALENDAR_URL}`
    : `📭 ${date} の予約はありません。`;
}

  // 空き枠表示
if (state.step === 'awaitingFreeDate') {
  const date = extractDate(trimmed);
  const slots = await getAvailableSlots(date);
  userContext.delete(userId);
  return slots.length
    ? `🟢 ${date} の空き枠：\n` + slots.map((s, i) => `${i + 1}. ${s}`).join('\n') + `\n\n📅 予約一覧はこちらから確認できます♪：\n${CALENDAR_URL}`
    : `🚫 ${date} は空き枠がありません。`;
}

  // その他の入力
  return '🤖 「開始」でメニューを表示できます。';
}

module.exports = { handleBotMessage };