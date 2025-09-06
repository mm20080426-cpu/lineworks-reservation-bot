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

// ユーザーごとの選択状態を保持
const userState = new Map();

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

  // 日付抽出（柔軟な形式に対応）
  const selectedDate = extractDate(messageText) || new Date().toISOString().slice(0, 10);

  // 「予約」メッセージに反応して時間枠を提示
  if (messageText.includes('予約')) {
    const slots = getAvailableTimeSlots(selectedDate);
    if (!slots || slots.length === 0) {
      replyText = `🚫 ${selectedDate} は休診日です。別の日を選んでください。`;
    } else {
      userState.set(userId, selectedDate);
      replyText = `📅 ${selectedDate} の予約枠です。番号でお選びください。\n` +
                  slots.map((slot, i) => `${i + 1}. ${slot}`).join('\n');
    }
  }

  // 数字だけのメッセージ → 時間枠選択とみなす
  const selectedIndex = parseInt(messageText);
  if (!isNaN(selectedIndex)) {
    const dateForUser = userState.get(userId) || selectedDate;
    const slots = getAvailableTimeSlots(dateForUser);
    if (slots && selectedIndex >= 1 && selectedIndex <= slots.length) {
      const selectedSlot = slots[selectedIndex - 1];
      replyText = await registerReservation(userId, dateForUser, selectedSlot);
      console.log(`[INFO] 予約登録: userId=${userId}, date=${dateForUser}, slot=${selectedSlot}`);
      userState.delete(userId);
    }
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