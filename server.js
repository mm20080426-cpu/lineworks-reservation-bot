require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const fetchAccessToken = require('./tokenFetcher');
const getAccountIdFromUserId = require('./userFetcher');
const { handleBotMessage } = require('./botMessageHandler');

const app = express();
app.use(express.json());

const BOT_ID = process.env.LW_BOT_ID;
const BOT_SECRET = process.env.LW_BOT_SECRET;

// Google認証ファイル復元（Render用）
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

// 署名検証
function verifySignature(reqBody, signatureHeader, botSecret) {
  const bodyString = JSON.stringify(reqBody);
  const hmac = crypto.createHmac('sha256', botSecret);
  hmac.update(bodyString);
  const expectedSignature = hmac.digest('base64');

  console.log('[DEBUG] 署名比較:', {
    expected: expectedSignature,
    received: signatureHeader
  });

  return expectedSignature === signatureHeader;
}

// LINE WORKSへの返信（1:1専用）
async function sendReply(userId, replyText) {
  try {
    const accessToken = await fetchAccessToken();
    const accountId = await getAccountIdFromUserId(userId, accessToken);
    const finalText = Array.isArray(replyText) ? replyText.join('\n') : replyText;

    console.log('[DEBUG] accountId:', accountId);
    console.log('[DEBUG] replyText:', replyText);

    await axios.post(
      `https://www.worksapis.com/v1.0/bots/${BOT_ID}/users/${accountId}/messages`,
      { content: { type: 'text', text: finalText } },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );

    console.log('[INFO] LINE WORKSへの返信成功');
  } catch (err) {
    console.error('[ERROR] LINE WORKSへの返信失敗:', err.response?.data || err.message);
  }
}

// Webhook受信エンドポイント
app.post('/lineworks/callback', async (req, res) => {
  console.log('[DEBUG] Webhook受信:', JSON.stringify(req.body, null, 2)); // ← 追加

  const signatureHeader = req.headers['x-works-signature'];
  if (!verifySignature(req.body, signatureHeader, BOT_SECRET)) {
    console.warn('[WARN] 署名検証失敗');
    return res.sendStatus(403);
  }

  const events = req.body.events;
  if (!Array.isArray(events)) return res.sendStatus(400);

  for (const event of events) {
    if (event.type === 'message' && event.content?.type === 'text') {
      const userId = event.source.userId;
      const messageText = event.content.text.trim();
      const replyText = await handleBotMessage(userId, messageText);
      console.log('[DEBUG] handleBotMessage → replyText:', replyText);
      await sendReply(userId, replyText);
    }
  }

  res.sendStatus(200);
});

// ヘルスチェック
app.get('/ping', (req, res) => {
  res.status(200).send('OK');
});

// サーバー起動
const PORT = parseInt(process.env.PORT, 10) || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[INFO] サーバー起動完了（ポート: ${PORT}）`);
});