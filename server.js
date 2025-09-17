require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const fetch = require('node-fetch');

const {
  registerReservation,
  cancelReservation,
  getReservationsByDate,
  getReservationsByDateRaw,
  getAvailableSlots
} = require('./reservationService');
const { getAvailableTimeSlots, normalizeDate } = require('./calendarUtils');
const fetchAccessToken = require('./tokenFetcher');
const getAccountIdFromUserId = require('./userFetcher');

const app = express();
app.use(express.json());

const BOT_ID = process.env.LW_BOT_ID;
const BOT_SECRET = process.env.LW_BOT_SECRET;

// ✅ GoogleカレンダーURL（Notice用）
const CALENDAR_URL = 'https://calendar.google.com/calendar/ical/santamarialineworks%40gmail.com/public/basic.ics';

// ✅ Notice送信用関数
function sendNotice(roomId, accessToken, botId, messageText) {
  return axios.post(`https://www.worksapis.com/v1.0/bots/${botId}/messages`, {
    roomId,
    content: {
      type: 'notice',
      text: messageText
    }
  }, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
}

// ✅ Render環境用：google-credentials.json を復元
const base64 = process.env.GOOGLE_CREDENTIALS_BASE64;
if (base64) {
  try {
    const json = Buffer.from(base64, 'base64').toString('utf8');
    fs.writeFileSync('google-credentials.json', json);
    console.log('[INFO] google-credentials.json を復元しました');
  } catch (err) {
    console.error('[ERROR] google-credentials.json の復元失敗:', err);
  }
}

// ユーザー状態管理
const userState = new Map();

// 署名検証
function verifySignature(reqBody, signatureHeader, botSecret) {
  const bodyString = JSON.stringify(reqBody);
  const hmac = crypto.createHmac('sha256', botSecret);
  hmac.update(bodyString);
  const expectedSignature = hmac.digest('base64');
  return expectedSignature === signatureHeader;
}

// 日付抽出関数
function extractDate(messageText) {
  const fullDateRegex = /(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?/;
  const shortDateRegex = /(\d{1,2})[\/月](\d{1,2})日?/;

  let yyyy, mm, dd;
  const fullMatch = messageText.match(fullDateRegex);
  if (fullMatch) {
    yyyy = fullMatch[1];
    mm = fullMatch[2].padStart(2, '0');
    dd = fullMatch[3].padStart(2, '0');
  } else {
    const shortMatch = messageText.match(shortDateRegex);
    if (shortMatch) {
      yyyy = new Date().getFullYear();
      mm = shortMatch[1].padStart(2, '0');
      dd = shortMatch[2].padStart(2, '0');
    }
  }

  return yyyy && mm && dd ? `${yyyy}-${mm}-${dd}` : null;
}

// 時間抽出関数
function extractTimeFromReservation(text) {
  const match = text.match(/(\d{1,2}:\d{2}〜\d{1,2}:\d{2})/);
  return match ? match[1] : null;
}

// Webhook受信
app.post('/lineworks/callback', async (req, res) => {
  const signatureHeader = req.headers['x-works-signature'];
  if (!verifySignature(req.body, signatureHeader, BOT_SECRET)) {
    console.warn('[WARN] 署名検証失敗');
    return res.sendStatus(403);
  }

  const event = req.body;
  if (event.type !== 'message') return res.sendStatus(200);

  const messageText = event.content.text.trim();
  const userId = event.source?.userId;
  const roomId = event.source?.roomId;
  const state = userState.get(userId);
  let replyText = '';

  console.log('[DEBUG] 受信メッセージ:', messageText);
  console.log('[DEBUG] ユーザーID:', userId);
  console.log('[DEBUG] 現在のステート:', state);

  // ✅ 「開始」メッセージ処理
  if (messageText === '開始') {
  try {
    const accessToken = await fetchAccessToken();
    const accountId = await getAccountIdFromUserId(userId, accessToken);

    if (event.source.roomId) {
      const noticeText = `📅 Googleカレンダーはこちらから確認できます：\n${CALENDAR_URL}`;
      await sendNotice(event.source.roomId, accessToken, BOT_ID, noticeText);
    } else {
      replyText += `\n\n📅 Googleカレンダーはこちらから確認できます：\n${CALENDAR_URL}`;
    }

    userState.set(userId, { step: 'menu' });
    replyText =
        '✅ 接続を再開しました！以下のメニューから選んでください：\n' +
          '・予約\n' +
          '・キャンセル\n' +
          '・一覧\n' +
          '・空き\n' +
          '※ 文字で入力してください（例：「予約」）';
    } catch (err) {
      console.error('[ERROR] 開始処理失敗:', err.message);
      replyText = '⚠️ サーバーが応答していません。管理者に連絡してください。';
    }

    return sendReply(userId, replyText);
  }

  // ✅ 予約フロー
if (messageText === '予約') {
  userState.set(userId, { step: 'awaitingDate' });
  replyText = '📅 日付を入力してください（例：9/11 または 2025/9/11）';

} else if (state?.step === 'awaitingDate') {
  const selectedDate = extractDate(messageText);
  if (!selectedDate) {
    replyText = '⚠️ 日付の形式が正しくありません。もう一度入力してください。';
  } else {
    const normalizedDate = normalizeDate(selectedDate);

    const calendarSlots = getAvailableTimeSlots(normalizedDate);

    // ✅ 修正：nullではなく、空配列のみを休診日と判定
    if (!Array.isArray(calendarSlots)) {
      replyText = `🚫 ${selectedDate} は休診日です。別の日を選んでください。`;
    } else {
      const availableSlots = await getAvailableSlots(normalizedDate);

      const filteredSlots = calendarSlots.filter(slot =>
        availableSlots.includes(slot.replace(/〜|～|-/g, '〜').trim())
      );

      if (filteredSlots.length === 0) {
        replyText = `🚫 ${selectedDate} は空き枠がありません。別の日を選んでください。`;
      } else {
        userState.set(userId, {
          step: 'dateSelected',
          selectedDate,
          normalizedDate,
          availableSlots: filteredSlots
        });

        replyText = `📅 ${selectedDate} の空き枠です。番号でお選びください。\n` +
                    filteredSlots.map((slot, i) => `${i + 1}. ${slot}`).join('\n');
      }
    }
  }
}else if (state?.step === 'dateSelected' && /^\d+$/.test(messageText)) {
  const index = parseInt(messageText) - 1;
  const selectedSlot = state.availableSlots[index];

  if (selectedSlot) {
    userState.set(userId, {
      ...state,
      step: 'awaitingName',
      selectedSlot
    });

    replyText = `✅ ${state.selectedDate} の ${selectedSlot} を選択しました。\n👤 お名前を入力してください。`;
  } else {
    replyText = `⚠️ 有効な番号を選択してください。`;
  }

} else if (state?.step === 'awaitingName') {
  const name = messageText;
  userState.set(userId, {
    ...state,
    step: 'awaitingNote',
    name
  });

  replyText = `📝 備考があれば入力してください（未入力でもOKです）。`;

} else if (state?.step === 'awaitingNote') {
  const note = messageText || 'なし';

  replyText = await registerReservation(
    userId,
    state.normalizedDate, // ← 修正ポイント：予約登録には統一済み日付を使う
    state.selectedSlot,
    state.name,
    note
  );

  try {
    const accessToken = await fetchAccessToken();
    const noticeText = `📅 Googleカレンダーはこちらから確認できます：\n${CALENDAR_URL}`;

    // ✅ roomIdがある場合はNotice送信
    if (event.source.roomId) {
      await sendNotice(event.source.roomId, accessToken, BOT_ID, noticeText);
      console.log('[INFO] Notice送信完了（予約後）');
    } else {
      // ✅ 1:1トークではreplyTextにURLを追加
      replyText += `\n\n${noticeText}`;
      console.log('[INFO] 通常メッセージでURL案内（1:1トーク）');
    }
  } catch (err) {
    console.error('[ERROR] Notice送信失敗:', err.response?.data || err.message);
  }

  userState.delete(userId);
}

// ✅ キャンセルフロー開始
else if (messageText === 'キャンセル') {
  userState.set(userId, { step: 'awaitingCancelDate' });
  replyText = '📅 キャンセルしたい日付を入力してください（例：9/11）';
}

// ✅ 日付入力 → 番号付き予約一覧を表示
else if (state?.step === 'awaitingCancelDate') {
  const cancelDate = extractDate(messageText);
  if (!cancelDate) {
    replyText = '⚠️ 日付の形式が正しくありません。もう一度入力してください。';
  } else {
    const reservationList = await getReservationsByDate(cancelDate);
    console.log('[DEBUG] キャンセル対象日の予約一覧:', reservationList);

    const numberedList = reservationList.map((item, index) => `${index + 1}. ${item}`);

    userState.set(userId, {
      step: 'awaitingCancelSelection',
      cancelDate,
      originalList: reservationList
    });

    replyText =
      `🕒 ${cancelDate} のキャンセルしたい予約を番号で選んでください（例：1）\n\n📋 予約一覧:\n` +
      (numberedList.length ? numberedList.join('\n') : '📭 予約はありません。');
  }
}

// ✅ 番号選択 → キャンセル実行
else if (state?.step === 'awaitingCancelSelection') {
  const selectedIndex = parseInt(messageText, 10) - 1;
  const originalList = state.originalList;

  if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= originalList.length) {
    replyText = '⚠️ 番号が正しくありません。もう一度入力してください（例：1）';
  } else {
    const selectedItem = originalList[selectedIndex];
    const cancelTime = extractTimeFromReservation(selectedItem);

    console.log('[DEBUG] キャンセル対象:', selectedItem);
    console.log('[DEBUG] 抽出された時間枠:', cancelTime);

    const rawReservations = await getReservationsByDateRaw(state.cancelDate);
    const matched = rawReservations.find(r => {
      const sheetTime = r[3]?.replace(/〜|～|~|-/g, '〜').trim();
      return sheetTime === cancelTime;
    });

    if (!matched) {
      replyText = `⚠️ ${state.cancelDate} の ${cancelTime} に一致する予約が見つかりませんでした。`;
    } else {
      const reservationId = matched[0];
      const selectedDate = matched[2];
      const timeSlot = matched[3];

      const cancelMessage = await cancelReservation(userId, reservationId, selectedDate, timeSlot);
      console.log('[DEBUG] cancelReservation() 呼び出し:', {
        userId,
        reservationId,
        selectedDate,
        timeSlot
      });
      console.log('[DEBUG] キャンセル結果メッセージ:', cancelMessage);

      try {
        const accessToken = await fetchAccessToken();
        const noticeText = `📅 Googleカレンダーはこちらから確認できます：\n${CALENDAR_URL}`;
        await sendNotice(roomId, accessToken, BOT_ID, noticeText);
        console.log('[INFO] Notice送信完了（キャンセル後）');
      } catch (err) {
        console.error('[ERROR] Notice送信失敗:', err.response?.data || err.message);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      const updatedList = await getReservationsByDate(state.cancelDate);
      const numberedUpdatedList = updatedList.map((item, i) => `${i + 1}. ${item}`);

      replyText =
        `${cancelMessage}\n\n📋 最新の予約一覧:\n` +
        (numberedUpdatedList.length ? numberedUpdatedList.join('\n') : '📭 予約はありません。');

      userState.delete(userId);
    }
  }
}

  // ✅ 一覧フロー
else if (messageText === '一覧') {
  userState.set(userId, { step: 'awaitingListDate' });
  replyText = '📅 一覧を表示したい日付を入力してください（例：9/11 または 2025/9/11）';
} else if (state?.step === 'awaitingListDate') {
  const listDate = extractDate(messageText);
  if (!listDate) {
    replyText = '⚠️ 日付の形式が正しくありません。もう一度入力してください。';
  } else {
    replyText = await getReservationsByDate(listDate);

    // ✅ Notice送信（一覧表示後）
    try {
      const accessToken = await fetchAccessToken();
      const noticeText = `📅 Googleカレンダーはこちらから確認できます：\n${CALENDAR_URL}`;
      await sendNotice(event.source.roomId, accessToken, BOT_ID, noticeText);
      console.log('[INFO] Notice送信完了（一覧表示後）');
    } catch (err) {
      console.error('[ERROR] Notice送信失敗:', err.response?.data || err.message);
    }

    userState.delete(userId);
  }
}

// ✅ 空き枠フロー
else if (messageText === '空き') {
  userState.set(userId, { step: 'awaitingFreeDate' });
  replyText = '📅 空き状況を確認したい日付を入力してください（例：9/11）';
} else if (state?.step === 'awaitingFreeDate') {
  const freeDate = extractDate(messageText);
  if (!freeDate) {
    replyText = '⚠️ 日付の形式が正しくありません。もう一度入力してください。';
  } else {
    const slots = await getAvailableSlots(freeDate);
    if (!slots || slots.length === 0) {
      replyText = `🚫 ${freeDate} は空き枠がありません。別の日を選んでください。`;
    } else {
      replyText = `🟢 ${freeDate} の空き枠です：\n` +
                  slots.map((slot, i) => `${i + 1}. ${slot}`).join('\n');

      // ✅ Notice送信（空き枠案内後）
      try {
        const accessToken = await fetchAccessToken();
        const noticeText = `📅 Googleカレンダーはこちらから確認できます：\n${CALENDAR_URL}`;
        await sendNotice(event.source.roomId, accessToken, BOT_ID, noticeText);
        console.log('[INFO] Notice送信完了（空き枠案内後）');
      } catch (err) {
        console.error('[ERROR] Notice送信失敗:', err.response?.data || err.message);
      }
    }

    userState.delete(userId);
  }
}

 // ✅ 予約完了時（state.step === 'awaitingNote'）にNotice送信
else if (state?.step === 'awaitingNote') {
  const note = messageText || 'なし';

  replyText = await registerReservation(
    userId,
    state.normalizedDate,
    state.selectedSlot,
    state.name,
    note
  );

  try {
    const accessToken = await fetchAccessToken();
    const noticeText = `📅 Googleカレンダーはこちらから確認できます：\n${CALENDAR_URL}`;
    await sendNotice(roomId, accessToken, BOT_ID, noticeText);
    console.log('[INFO] Notice送信完了（予約後）');
  } catch (err) {
    console.error('[ERROR] Notice送信失敗:', err.response?.data || err.message);
  }

  userState.delete(userId);
}

  // ✅ その他の入力
  else {
    replyText = '🤖 「開始」でメニューを表示できます。';
  }

  return sendReply(userId, replyText);
});

// ✅ LINE WORKSへの返信関数
async function sendReply(userId, replyText) {
  try {
    const accessToken = await fetchAccessToken();
    const accountId = await getAccountIdFromUserId(userId, accessToken);

    const finalText = Array.isArray(replyText) ? replyText.join('\n') : replyText;
    if (!finalText || typeof finalText !== 'string' || finalText.trim() === '') {
      throw new Error('送信内容が空または不正です');
    }

    await axios.post(
      `https://www.worksapis.com/v1.0/bots/${BOT_ID}/users/${accountId}/messages`,
      {
        content: {
          type: 'text',
          text: finalText
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('[INFO] LINE WORKSへの返信成功');
  } catch (err) {
    console.error('[ERROR] LINE WORKSへの返信失敗:', err.response?.data || err.message);
  }
}

// ✅ ヘルスチェック
app.get('/ping', (req, res) => {
  res.status(200).send('OK');
});

// ✅ サーバー起動
const PORT = parseInt(process.env.PORT, 10) || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[INFO] サーバー起動完了（ポート: ${PORT}）`);
});