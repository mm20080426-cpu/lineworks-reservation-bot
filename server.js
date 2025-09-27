// server.js (修正版)

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');

// ★ 修正点: tokenFetcher から直接関数をインポートするように変更
const fetchAccessToken = require('./tokenFetcher'); // getAccessToken ではなく fetchAccessToken を直接取得

const botMessageHandler = require('./botMessageHandler');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json({
    verify: (req, res, buf) => {
        req.rawBody = buf; // 署名検証のためにrawBodyを保存
    }
}));

const verifySignature = (req, res, next) => {
    const channelSecret = process.env.LW_BOT_SECRET; 
    
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

app.post('/lineworks/callback', verifySignature, async (req, res) => {
    console.log('Webhook受信:', JSON.stringify(req.body, null, 2));

    try {
        // ★ 修正点: インポートした fetchAccessToken 関数を直接呼び出す
        const accessToken = await fetchAccessToken(); 
        
        // アクセストークンが null の場合のエラーハンドリングを追加
        if (!accessToken) {
            console.error('アクセストークンの取得に失敗したため、メッセージ処理をスキップします。');
            return res.status(500).send('Failed to get access token.');
        }

        await botMessageHandler.handleBotMessage(req.body, accessToken);
        res.status(200).send('OK');
    } catch (error) {
        console.error('メッセージ処理中にエラーが発生しました:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/ping', (req, res) => {
    res.status(200).send('Bot is running!');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});