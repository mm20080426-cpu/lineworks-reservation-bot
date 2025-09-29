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
const SYNC_URL = process.env.SYNC_URL;

let isBotConnected = false;

// アクセストークンキャッシュ
let cachedToken = null;
let tokenExpireAt = 0;
async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpireAt) {
    return cachedToken;
  }
  const token = await fetchAccessToken();
  if (!token) throw new Error('アクセストークン取得失敗');
  cachedToken = token;
  tokenExpireAt = now + 110 * 60 * 1000;
  return token;
}

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

// Bot接続処理
async function connectBot() {
  try {
    const accessToken = await getAccessToken();
    if (accessToken) {
      isBotConnected = true;
      console.log('[INFO] Bot接続完了');
    } else {
      throw new Error('アクセストークン取得失敗');
    }
  } catch (err) {
    console.error('[ERROR] Bot接続失敗:', err.message);
    isBotConnected = false;
  }
}

// LINE WORKSへの返信
async function sendReply(userId, replyTexts) {
  try {
    const accessToken = await getAccessToken();
    const recipientId = await getAccountIdFromUserId(userId, accessToken);

    if (!recipientId) {
      console.warn(`[WARN] recipientId が取得できません（userId: ${userId}）`);
      return await sendReply(userId, '❌ ユーザー情報の取得に失敗しました。もう一度お試しください。');
    }

    const messages = (Array.isArray(replyTexts) ? replyTexts : [replyTexts]).map(text => ({
      content: { type: 'text', text }
    }));

    await Promise.all(
      messages.map(message =>
        axios.post(
          `https://www.worksapis.com/v1.0/bots/${BOT_ID}/users/${recipientId}/messages`,
          message,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        )
      )
    );

    console.log('[INFO] LINE WORKSへの返信成功');
  } catch (err) {
    console.error('[ERROR] LINE WORKSへの返信失敗:', err.response?.data || err.message);
  }
}

// Webhook受信エンドポイント
app.post('/lineworks/callback', (req, res) => {
  console.log('[DEBUG] Webhook受信:', JSON.stringify(req.body, null, 2));

  const signatureHeader = req.headers['x-works-signature'];
  if (!verifySignature(req.body, signatureHeader, BOT_SECRET)) {
    console.warn('[WARN] 署名検証失敗');
    return res.sendStatus(403);
  }

  res.sendStatus(200); // 即応答

  (async () => {
    const events = Array.isArray(req.body.events) ? req.body.events : [req.body];

    for (const event of events) {
      if (event.type === 'message' && event.content?.type === 'text') {
        const userId = event.source.userId;
        const messageText = event.content.text.trim();

        try {
          const replyText = await handleBotMessage(userId, messageText);
          await sendReply(userId, replyText);

          // Google Apps Script へ予約データ送信
          axios.post(SYNC_URL, {
            userId,
            messageText,
            timestamp: new Date().toISOString()
          }, {
            headers: { 'Content-Type': 'application/json' }
          }).then(() => {
            console.log('[INFO] GASへ予約データ送信成功');
          }).catch(err => {
            console.error('[ERROR] GAS送信失敗:', err.response?.data || err.message);
          });

        } catch (err) {
          console.error('[ERROR] メッセージ処理失敗:', err.message);
          await sendReply(userId, '❌ 処理中にエラーが発生しました。もう一度お試しください。');
        }
      }
    }
  })();
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