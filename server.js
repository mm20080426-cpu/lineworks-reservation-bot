// server.js (修正版)

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios'); // ★ axios をインポート

const fetchAccessToken = require('./tokenFetcher');
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

// ★ 新しい関数: LINE WORKSへの返信を送信
async function sendReply(userId, messageContent, accessToken) {
    const botId = process.env.LINEWORKS_BOT_ID; // 環境変数からBot IDを取得
    if (!botId) {
        console.error('[ERROR] LINEWORKS_BOT_ID が環境変数に設定されていません。');
        return;
    }

    const url = `https://www.lineworks.com/r/bot/message/v2/bot/${botId}/user/${userId}`;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
    };
    try {
        await axios.post(url, messageContent, { headers });
        console.log(`[INFO] LINE WORKSへ返信を送信しました: ${JSON.stringify(messageContent)}`);
    } catch (error) {
        console.error('[ERROR] LINE WORKSへの返信に失敗しました:', error.response?.data || error.message);
        // エラー詳細ログ
        if (error.response?.data) {
            console.error('LINE WORKS APIエラーレスポンス:', error.response.data);
        }
    }
}


app.post('/lineworks/callback', verifySignature, async (req, res) => {
    console.log('Webhook受信:', JSON.stringify(req.body, null, 2));

    try {
        const accessToken = await fetchAccessToken(); 
        
        if (!accessToken) {
            console.error('アクセストークンの取得に失敗したため、メッセージ処理をスキップします。');
            return res.status(500).send('Failed to get access token.');
        }

        const { source, content } = req.body;
        const userId = source.userId;
        const messageText = content.type === 'text' ? content.text : null;

        if (messageText) { // テキストメッセージの場合のみ処理
            // ★ 修正点: botMessageHandlerに userId と messageText を渡し、返信を受け取る
            const botReplyText = await botMessageHandler.handleBotMessage(userId, messageText);

            if (botReplyText) {
                const replyMessage = {
                    type: 'text',
                    text: botReplyText
                };
                // ★ 修正点: sendReply 関数を使ってLINE WORKSに返信を送信
                await sendReply(userId, replyMessage, accessToken);
            } else {
                console.log(`[INFO] BotHandlerから返信テキストがありませんでした。userId: ${userId}, message: "${messageText}"`);
            }
        } else {
            console.log(`[INFO] テキストメッセージ以外のコンテンツを受信しました。処理をスキップします。 userId: ${userId}, type: ${content.type}`);
        }

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