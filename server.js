// server.js の修正箇所

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const { getAccessToken } = require('./tokenFetcher');
const botMessageHandler = require('./botMessageHandler');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json({
    verify: (req, res, buf) => {
        req.rawBody = buf; // 署名検証のためにrawBodyを保存
    }
}));

// LINE WORKSからのリクエストの署名を検証するミドルウェア
const verifySignature = (req, res, next) => {
    // ★ 修正点: ここを LINEWORKS_CHANNEL_SECRET から LW_BOT_SECRET に変更します
    const channelSecret = process.env.LW_BOT_SECRET; 
    
    // channelSecret が undefined の場合に早期エラーハンドリングを追加
    if (!channelSecret) {
        console.error('LW_BOT_SECRET が環境変数に設定されていません。');
        return res.status(500).send('Server configuration error: Channel secret is missing.');
    }

    const signature = req.headers['x-works-signature'];
    const hash = crypto.createHmac('sha256', channelSecret).update(req.rawBody).digest('base64');

    if (hash === signature) {
        next();
    } else {
        console.error('署名検証失敗:', { expected: hash, received: signature, body: req.rawBody.toString() });
        res.status(401).send('Unauthorized');
    }
};

// LINE WORKS Webhook エンドポイント
app.post('/lineworks/callback', verifySignature, async (req, res) => {
    console.log('Webhook受信:', JSON.stringify(req.body, null, 2));

    try {
        const accessToken = await getAccessToken();
        await botMessageHandler.handleBotMessage(req.body, accessToken);
        res.status(200).send('OK');
    } catch (error) {
        console.error('メッセージ処理中にエラーが発生しました:', error);
        res.status(500).send('Internal Server Error');
    }
});

// ヘルスチェック用エンドポイント (Renderの設定に合わせて /ping に変更済み)
app.get('/ping', (req, res) => {
    res.status(200).send('Bot is running!');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});