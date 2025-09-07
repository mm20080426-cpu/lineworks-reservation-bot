require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const {
  registerReservation,
  cancelReservation,
  getReservationsByDate
} = require('./reservationService');
const { getAvailableTimeSlots } = require('./calendarUtils');
const fetchAccessToken = require('./tokenFetcher');
const getAccountIdFromUserId = require('./userFetcher');

const app = express();
app.use(express.json());

const BOT_ID = process.env.LW_BOT_ID;
const BOT_SECRET = process.env.LW_BOT_SECRET;

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
  const state = userState.get(userId);
  let replyText = '';

  // ✅ 「開始」→ ボタンテンプレート表示
  if (messageText === '開始') {
    userState.set(userId, { step: 'menu' });

    const accessToken = await fetchAccessToken();
    const accountId = await getAccountIdFromUserId(userId, accessToken);

    const templateMessage = {
      accountId,
      content: {
        type: 'template',
        template: {
          type: 'button',
          contentText: '👋 はじめまして！以下のメニューから選んでください：',
          actions: [
            { type: 'message', label: '予約', text: '予約' },
            { type: 'message', label: 'キャンセル', text: 'キャンセル' },
            { type: 'message', label: '一覧', text: '一覧' },
            { type: 'message', label: '空き', text: '空き' }
          ]
        }
      }
    };

    await axios.post(
      `https://www.worksapis.com/v1.0/bots/${BOT_ID}/users/${accountId}/messages`,
      templateMessage,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.sendStatus(200);
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
      const slots = getAvailableTimeSlots(selectedDate);
      if (!slots || slots.length === 0) {
        replyText = `🚫 ${selectedDate} は休診日です。別の日を選んでください。`;
      } else {
        userState.set(userId, {
          step: 'dateSelected',
          selectedDate,
          availableSlots: slots
        });

        replyText = `📅 ${selectedDate} の予約枠です。番号でお選びください。\n` +
                    slots.map((slot, i) => `${i + 1}. ${slot}`).join('\n');
      }
    }
  } else if (state?.step === 'dateSelected' && /^\d+$/.test(messageText)) {
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
      state.selectedDate,
      state.selectedSlot,
      state.name,
      note
    );

    console.log(`[INFO] 予約登録: userId=${userId}, date=${state.selectedDate}, slot=${state.selectedSlot}, name=${state.name}, note=${note}`);
    userState.delete(userId);
  }

  // ✅ キャンセルフロー
  else if (messageText === 'キャンセル') {
    userState.set(userId, { step: 'awaitingCancelDate' });
    replyText = '📅 キャンセルしたい日付を入力してください（例：9/11）';
  } else if (state?.step === 'awaitingCancelDate') {
    const cancelDate = extractDate(messageText);
    if (!cancelDate) {
      replyText = '⚠️ 日付の形式が正しくありません。もう一度入力してください。';
    } else {
      userState.set(userId, {
        step: 'awaitingCancelTime',
        cancelDate
      });
      replyText = `🕒 ${cancelDate} のキャンセルしたい時間枠を入力してください（例：10:00）`;
    }
  } else if (state?.step === 'awaitingCancelTime') {
    const cancelTime = messageText;
    replyText = await cancelReservation(userId, state.cancelDate, cancelTime);
    userState.delete(userId);
  }

  // ✅ 一覧フロー
  else if (messageText === '一覧') {
    userState.set(userId, { step: 'awaitingListDate' });
    replyText = '📅 一覧を表示したい日付を入力してください（例：9/11）';
  } else if (state?.step === 'awaitingListDate') {
    const listDate = extractDate(messageText);
    if (!listDate) {
      replyText = '⚠️ 日付の形式が正しくありません。もう一度入力してください。';
    } else {
      const list = await getReservationsByDate(listDate);
      replyText = list.length > 0
        ? `📋 ${listDate} の予約一覧：\n` + list.join('\n')
        : `📭 ${listDate} の予約はまだありません。`;
            userState.delete(userId);
    }
  }

  // ✅ 空き枠フロー
  else if (messageText === '空き') {
    userState.set(userId, { step: 'awaitingAvailableDate' });
    replyText = '📅 空き枠を確認したい日付を入力してください（例：9/11）';
  } else if (state?.step === 'awaitingAvailableDate') {
    const availableDate = extractDate(messageText);
    if (!availableDate) {
      replyText = '⚠️ 日付の形式が正しくありません。もう一度入力してください。';
    } else {
      const slots = getAvailableTimeSlots(availableDate);
      replyText = slots.length > 0
        ? `🈳 ${availableDate} の空き枠：\n` + slots.join('\n')
        : `😢 ${availableDate} はすべて埋まっています。`;
      userState.delete(userId);
    }
  }

  // ✅ LINE WORKS への返信処理
  try {
    const accessToken = await fetchAccessToken();
    const accountId = await getAccountIdFromUserId(userId, accessToken);
    if (!accountId) {
      console.warn('[WARN] accountId取得失敗');
      return res.sendStatus(400);
    }

    await axios.post(
      `https://www.worksapis.com/v1.0/bots/${BOT_ID}/users/${accountId}/messages`,
      {
        accountId,
        content: {
          type: 'text',
          text: replyText
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.sendStatus(200);
  } catch (error) {
    console.error('[ERROR] メッセージ送信失敗:', error);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[INFO] Server is running on port ${PORT}`);
});