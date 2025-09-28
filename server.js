require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const fetchAccessToken = require('./tokenFetcher');
const getAccountIdFromUserId = require('./userFetcher');
// 🚨 修正点 1: triggerGasSync もインポート
const { handleBotMessage, triggerGasSync } = require('./botMessageHandler');

const app = express();
app.use(express.json());

const BOT_ID = process.env.LW_BOT_ID;
const BOT_SECRET = process.env.LW_BOT_SECRET;

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
  // 有効期限2時間（念のため1時間50分で更新する）
  cachedToken = token;
  tokenExpireAt = now + 110 * 60 * 1000;
  return cachedToken;
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

// Bot接続処理（再接続対応）
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

// LINE WORKSへの返信（複数メッセージ対応）
async function sendReply(userId, replyTexts) {
  try {
    const accessToken = await getAccessToken();
    const recipientId = await getAccountIdFromUserId(userId, accessToken);

    if (!recipientId) {
      console.warn(`[WARN] recipientId が取得できません（userId: ${userId}）`);
      return await sendReply(userId, '❌ ユーザー情報の取得に失敗しました。もう一度お試しください。');
    }

    // 応答テキストが単一の文字列の場合もあるため、配列であることを保証
    const texts = Array.isArray(replyTexts) ? replyTexts : [replyTexts];
    
    const messages = texts.map(text => ({
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

  // 🚨 最速応答: GASの処理を待たず、ここで即座にHTTP 200を返す
  res.sendStatus(200); 

  (async () => {
    const events = Array.isArray(req.body.events) ? req.body.events : [req.body];

    for (const event of events) {
      if (event.type === 'message' && event.content?.type === 'text') {
        const userId = event.source.userId;
        const messageText = event.content.text.trim();

        try {
          // 1. スプレッドシート処理と応答メッセージの生成 (ここでSSへの書き込みが完了する)
          const replyText = await handleBotMessage(userId, messageText);
          
          // 2. LINE WORKSへの返信 (Bot応答完了)
          await sendReply(userId, replyText);

            // 🚨 修正点 2: Bot応答完了後、カレンダー同期をGASに依頼
            // 予約またはキャンセルが成功した場合のみキックする
            const replyString = Array.isArray(replyText) ? replyText.join(' ') : replyText;
            if (replyString.includes('予約が完了しました') || replyString.includes('キャンセルが完了しました')) {
                console.log('[INFO] 予約/キャンセル完了: GAS同期をキックします');
                triggerGasSync(); // await を付けずに非同期で実行
            } else {
                console.log('[INFO] 通常メッセージ/フロー進行: GAS同期はスキップ');
            }

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