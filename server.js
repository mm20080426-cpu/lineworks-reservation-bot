require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { registerReservation } = require('./reservationService');
const { getAvailableTimeSlots } = require('./calendarUtils');
const fetchAccessToken = require('./tokenFetcher');
const getAccountIdFromUserId = require('./userFetcher');

const app = express();
app.use(express.json());

const BOT_ID = process.env.LW_BOT_ID;
const BOT_SECRET = process.env.LW_BOT_SECRET;

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

// 日付抽出関数（複数形式に対応）
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
  let replyText = '「予約」と入力すると時間枠を表示します。';

  const state = userState.get(userId);

  // ステップ①：日付入力 → 枠表示
  if (messageText.includes('予約')) {
    const selectedDate = extractDate(messageText) || new Date().toISOString().slice(0, 10);
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

  // ステップ②：枠番号選択 → 名前・備考入力へ
  else if (state?.step === 'dateSelected' && /^\d+$/.test(messageText)) {
    const index = parseInt(messageText) - 1;
    const selectedSlot = state.availableSlots[index];

    if (selectedSlot) {
      userState.set(userId, {
        ...state,
        step: 'slotSelected',
        selectedSlot
      });

      replyText = `✅ ${state.selectedDate} の ${selectedSlot} を選択しました。\n👤 お名前と備考を入力してください（例：名前：田中 備考：初診）`;
    } else {
      replyText = `⚠️ 有効な番号を選択してください。`;
    }
  }

  // ステップ③：名前・備考入力 → 予約確定
else if (state?.step === 'slotSelected') {
  // 「名前：」「備考：」形式がある場合は抽出
  const nameMatch = messageText.match(/名前：(.+?)(備考：|$)/);
  const noteMatch = messageText.match(/備考：(.+)/);

  let name = nameMatch ? nameMatch[1].trim() : '';
  let note = noteMatch ? noteMatch[1].trim() : '';

  // 形式が違う場合（例：田中 初診）→ スペース分割で補完
  if (!name && !note) {
    const parts = messageText.split(/[\s　]+/); // 半角・全角スペース対応
    name = parts[0] || '未入力';
    note = parts.slice(1).join(' ') || 'なし';
  }

    replyText = await registerReservation(userId, state.selectedDate, state.selectedSlot, name, note);
    console.log(`[INFO] 予約登録: userId=${userId}, date=${state.selectedDate}, slot=${state.selectedSlot}, name=${name}, note=${note}`);

    userState.delete(userId);
  }

  // LINE WORKS へ返信
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