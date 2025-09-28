const { registerReservation, cancelReservation, getReservationsByDate, getReservationsByDateRaw, getAvailableSlots } = require('./reservationService');
const { getAvailableTimeSlots } = require('./calendarUtils');
// Node.jsのfetch APIを使用するために必要ですが、今回は外部から呼び出すためこのファイルからは削除

const userContext = new Map();
// SYNC_URL は外部ファイルで利用するため、ここでは削除またはコメントアウト
// const SYNC_URL = process.env.SYNC_URL; 
const CALENDAR_URL = 'https://calendar.google.com/calendar/embed?src=santamarialineworks%40gmail.com&ctz=Asia%2FTokyo';

// ... (extractDate, extractTime の関数は省略) ...
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

// ----------------------------------------------------------------------
// 🚨 修正点 1: syncCalendar() の定義とエクスポート
// GASへのWebhook呼び出しを行うための関数をここで定義し、エクスポートします。
// ----------------------------------------------------------------------
async function triggerGasSync() {
  const SYNC_URL = process.env.GAS_SYNC_WEBHOOK_URL; // 環境変数名を確認
  if (!SYNC_URL) {
    console.error('❌ GAS_SYNC_WEBHOOK_URL が設定されていません。カレンダー同期をスキップ。');
    return;
  }
  try {
    // Node.jsの組み込みfetchを使用する場合、ここではbodyは空でPOSTを送信
    const res = await fetch(SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}) // 空のJSONオブジェクトを送信
    });
    const text = await res.text();
    console.log(`✅ カレンダー同期依頼成功。GAS応答: ${res.status} - ${text}`);
  } catch (err) {
    console.error('❌ カレンダー同期依頼失敗:', err.message);
  }
}

async function handleBotMessage(userId, messageText) {
  const state = userContext.get(userId);
  const trimmed = messageText.trim();

 // ... (メニュー、開始コマンド、メニュー選択ロジックは省略) ...
  // いきなり予約/一覧/空き/キャンセルが来た場合も対応
  if (['予約', 'キャンセル', '一覧', '空き'].includes(trimmed)) {
    userContext.set(userId, { step: 'menu' });
  }

  // 開始コマンド
  if (trimmed === '開始') {
    userContext.set(userId, { step: 'menu' });
    return '✅ おまたせしました！以下のメニューから選んでください♪：\n・予約\n・キャンセル\n・一覧\n・空き\n※ 文字で入力（例：「予約」）するか、下部のボタンを押してください♪';
  }

  // メニュー選択
  if (!state || !state.step || state.step === 'menu') {
    switch (trimmed) {
      case '予約':
        userContext.set(userId, { step: 'awaitingDate' });
        return '📅 予約したい日を入力してください（例：9/11 または 2025/9/11）';
      case 'キャンセル':
        userContext.set(userId, { step: 'awaitingCancelDate' });
        return '📅 キャンセルしたい患者の予約日を入力してください（例：9/11）';
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
    // 🚨 修正点 2: await syncCalendar() を削除！
    userContext.delete(userId);
    // 応答メッセージを工夫し、カレンダー反映に時間がかかることを通知
    return `${result}\n\n**✅ カレンダーに反映中です。数秒後にご確認ください。**`;
  }

  // キャンセルフロー
  if (state.step === 'awaitingCancelDate') {
  // ... (キャンセル対象のリスト生成ロジックは省略) ...
    const date = extractDate(trimmed);
    let raw = await getReservationsByDateRaw(date);

    if (!raw.length) {
      userContext.delete(userId);
      return `📭 ${date} の予約はありません。`;
    }

    raw.sort((a, b) => {
      const timeA = a[3]?.match(/\d{2}:\d{2}/)?.[0] || '';
      const timeB = b[3]?.match(/\d{2}:\d{2}/)?.[0] || '';
      return timeA.localeCompare(timeB);
    });

    const idMap = {};
    const list = raw.map((r, i) => {
      idMap[i + 1] = r[0]; // reservationId
      return `${i + 1}. 🕘 ${r[3]}｜👤 ${r[4]}｜📝 ${r[5]}`;
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
    // 🚨 修正点 2: await syncCalendar() を削除！
    userContext.delete(userId);
    // 応答メッセージを工夫し、カレンダー反映に時間がかかることを通知
    return `${result}\n\n**✅ カレンダーに反映中です。数秒後にご確認ください。**`;
  }

  // ... (一覧表示、空き枠表示ロジックは省略) ...
  // 一覧表示
  if (state.step === 'awaitingListDate') {
    const date = extractDate(trimmed);
    let list = await getReservationsByDate(date);
    userContext.delete(userId);

    if (!list.length) return `📭 ${date} の予約はありません。`;

    list.sort((a, b) => {
      const timeA = a.match(/(\d{1,2}:\d{2})〜/)?.[1] || '';
      const timeB = b.match(/(\d{1,2}:\d{2})〜/)?.[1] || '';
      return timeA.localeCompare(timeB);
    });

    return `📋 ${date} の予約一覧（時間順）：\n` +
      list.map(r => r.replace(/予約[枠]?ID[:：].*$/, '').trim()).join('\n');
  }

  // 空き枠表示
  if (state.step === 'awaitingFreeDate') {
    const date = extractDate(trimmed);
    const slots = await getAvailableSlots(date);
    userContext.delete(userId);
    return slots.length
      ? `🟢 ${date} の空き枠：\n` + slots.map((s, i) => `${i + 1}. ${s}`).join('\n')
      : `🚫 ${date} は空き枠がありません。`;
  }

  // その他の入力
  return '🤖 「開始」でメニューを表示できます。';
}

module.exports = { handleBotMessage, triggerGasSync }; // 🚨 修正点 3: triggerGasSync もエクスポート