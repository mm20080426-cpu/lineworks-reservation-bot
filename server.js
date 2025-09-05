require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { registerReservation } = require('./reservationService');
const fetchAccessToken = require('./tokenFetcher');
const getAccountIdFromUserId = require('./userFetcher');

const app = express();
app.use(express.json());

// .env に合わせて修正
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

// 時間枠生成
function generateTimeSlots(startHour = 9, endHour = 12, interval = 15) {
  const slots = [];
  let current = new Date();
  current.setHours(startHour, 0, 0, 0);
  while (current.getHours() < endHour) {
    const start = new Date(current);
    current.setMinutes(current.getMinutes() + interval);
    const end = new Date(current);
    slots.push(`${formatTime(start)}〜${formatTime(end)}`);
  }
  return slots;
}

function formatTime(date) {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
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

  if (messageText.includes('予約')) {
    const slots = generateTimeSlots();
    replyText = '診察のご予約ですね。以下の時間枠から番号でお選びください。\n' +
                slots.map((slot, i) => `${i + 1}. ${slot}`).join('\n');
  }

  const selectedIndex = parseInt(messageText);
  if (!isNaN(selectedIndex) && selectedIndex >= 1 && selectedIndex <= 12) {
    const selectedSlot = generateTimeSlots()[selectedIndex - 1];
    replyText = registerReservation(userId, selectedSlot);
    console.log(`[INFO] 予約登録: userId=${userId}, slot=${selectedSlot}`);
  }

  try {
    const accessToken = await fetchAccessToken();
    const accountId = await getAccountIdFromUserId(userId, accessToken);
    if (!accountId) {
      console.warn('[WARN] accountId取得失敗');
      return res.sendStatus(400);
    }

    await axios.post(`https://www.worksapis.com/v1.0/bots/${BOT_ID}/users/${accountId}/messages`, {
      accountId,
      content