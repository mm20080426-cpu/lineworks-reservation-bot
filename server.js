require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { registerReservation } = require('./reservationService');
const { getAvailableTimeSlots } = require('./calendarUtils');

const app = express();
app.use(express.json());

const BOT_SECRET = process.env.LW_BOT_SECRET;
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
  let replyText = '「予約」と入力すると時間枠を表示します。';

  const state = userState.get(userId);

  if (messageText === '予約') {
    userState.set(userId, { step: 'awaitingDate' });
    replyText = '📅 日付を入力してください（例：9/11 または 2025/9/11）';
  } else if (state?.step === 'awaitingDate') {
    const selectedDate = extractDate(messageText);
    if (!selectedDate) {
      replyText = '⚠️ 日付の形式が正しくありません。もう一度入力してください（例：9/11 または 2025/9/11）';
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

  // LINE WORKS Bot からのWebhook応答（直接返信）
  res.json({
    content: {
      type: 'text',
      text: replyText
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[INFO] Server is running on port ${PORT}`);
});