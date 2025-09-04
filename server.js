// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const fetchAccessToken = require('./tokenFetcher');
const getAccountIdFromUserId = require('./userFetcher'); // ← アドレス帳API用

const app = express();
app.use(express.json());

const BOT_ID = process.env.BOT_ID;
const BOT_SECRET = process.env.BOT_SECRET;

// 署名検証関数
function verifySignature(reqBody, signatureHeader, botSecret) {
  const bodyString = JSON.stringify(reqBody);
  const hmac = crypto.createHmac('sha256', botSecret);
  hmac.update(bodyString);
  const expectedSignature = hmac.digest('base64');
  return expectedSignature === signatureHeader;
}

// 時間枠生成関数
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

// Webhook受信エンドポイント
app.post('/lineworks/callback', async (req, res) => {
  console.log('📦 受信したリクエストボディ:', req.body);
console.log(JSON.stringify(req.body, null, 2));

  const signatureHeader = req.headers['x-works-signature'];
  if (!verifySignature(req.body, signatureHeader, BOT_SECRET)) {
    console.warn('⚠️ 不正な署名: リクエスト拒否');
    return res.sendStatus(403);
  }

  const event = req.body;
  if (event.type === 'message') {
    const messageContent = event.content.text.trim();
    const userId = event.source?.userId; // ← 修正ポイント

    console.log('📌 userId:', userId); // ← ここに追加

    let replyText = '「予約」または「確認」と入力してください。';

    // 「予約」と入力された場合
    if (messageContent.includes('予約')) {
      const slots = generateTimeSlots();
      replyText = '診察のご予約ですね。以下の時間枠から番号でお選びください。\n' +
                  slots.map((slot, i) => `${i + 1}. ${slot}`).join('\n');
    }

    // 数字で時間枠を選択された場合
    const selectedIndex = parseInt(messageContent);
    if (!isNaN(selectedIndex) && selectedIndex >= 1 && selectedIndex <= 12) {
      const selectedSlot = generateTimeSlots()[selectedIndex - 1];
      replyText = `✅ ${selectedSlot}で予約を承りました。\n担当医：佐藤先生`;
    }

    try {
      const accessToken = await fetchAccessToken();
     
      const accountId = await getAccountIdFromUserId(userId, accessToken);

     if (accountId) {
  console.log('✅ accountIdが取得できました:', accountId);
      } else {
        console.warn('⚠️ accountIdが取得できませんでした');
        return res.sendStatus(400);
      }

      await axios.post(`https://www.worksapis.com/v1.0/bots/${BOT_ID}/messages`, {
        accountId,
        content: {
          type: 'text',
          text: replyText
        }
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`✅ メッセージ送信成功: ${replyText}`);
    } catch (error) {
      console.error('❌ 返信エラー:', error.response?.data || error.message);
    }
  }

  res.sendStatus(200);
});

// サーバー起動
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});