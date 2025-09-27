// server.js (修正版)

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');

// tokenFetcher.js からアクセストークン取得関数をインポート
// 以前は getAccessToken.js でしたが、server.js が tokenFetcher.js を使用しているため、こちらに合わせます。
const { getAccessToken } = require('./tokenFetcher'); // ★ 修正: tokenFetcher からインポート

const botMessageHandler = require('./botMessageHandler');

const app = express();
const port = process.env.PORT || 3000;

// LINE WORKSからのリクエストボディをパースするためのミドルウェア
app.use(bodyParser.json({
    verify: (req, res, buf) => {
        req.rawBody = buf; // 署名検証のためにrawBodyを保存
    }
}));

// LINE WORKSからのリクエストの署名を検証するミドルウェア
const verifySignature = (req, res, next) => {
    const channelSecret = process.env.LINEWORKS_CHANNEL_SECRET;
    const signature = req.headers['x-works-signature'];
    const hash = crypto.createHmac('sha256', channelSecret).update(req.rawBody).digest('base64');

    if (hash === signature) {
        next();
    } else {
        console.error('署名検証失敗:', { expected: hash, received: signature, body: req.rawBody.toString() });
        res.status(401).send('Unauthorized');
    }
};

// ==========================================================
// ★ 削除するコードブロック: server.js内のトークンキャッシュロジック
// 以下のコードブロックは削除してください。
/*
let cachedAccessToken = null;
let tokenExpiryTime = 0; // トークンの有効期限 (UNIXミリ秒)

async function getAccessTokenInternal() {
    const now = Date.now();
    if (cachedAccessToken && tokenExpiryTime > now + 60 * 1000) { // 期限切れ1分前まで有効
        console.log('既存のアクセストークンを使用します。');
        return cachedAccessToken;
    }

    console.log('新しいアクセストークンを取得します...');
    try {
        const { getAccessToken: fetchToken } = require('./tokenFetcher'); // または './getAccessToken'
        const tokenData = await fetchToken(); // tokenFetcher.js からトークンを取得
        cachedAccessToken = tokenData.accessToken;
        // LINE WORKSのトークンは有効期限が1時間 (3600秒) なので、少し短めに設定
        tokenExpiryTime = now + (tokenData.expiresIn * 1000) - (5 * 60 * 1000); // 5分前を有効期限とする
        console.log('アクセストークンを更新しました。有効期限:', new Date(tokenExpiryTime).toLocaleString());
        return cachedAccessToken;
    } catch (error) {
        console.error('アクセストークンの取得に失敗しました:', error);
        throw error;
    }
}
*/
// ★ 削除するコードブロックここまで
// ==========================================================


// LINE WORKS Webhook エンドポイント
app.post('/lineworks/callback', verifySignature, async (req, res) => {
    console.log('Webhook受信:', JSON.stringify(req.body, null, 2));

    try {
        // ★ 修正: getAccessTokenInternal() の代わりに、インポートした getAccessToken() を直接呼び出す
        // アクセストークンを botMessageHandler に渡す
        const accessToken = await getAccessToken(); // tokenFetcher.js のキャッシュされたトークンを使用
        await botMessageHandler.handleBotMessage(req.body, accessToken);
        res.status(200).send('OK');
    } catch (error) {
        console.error('メッセージ処理中にエラーが発生しました:', error);
        res.status(500).send('Internal Server Error');
    }
});

// ヘルスチェック用エンドポイント
app.get('/ping', (req, res) => {
    res.status(200).send('Bot is running!');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});