// .envファイルから環境変数を読み込む（ローカル開発用）
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const app = express();

const BOT_ID = process.env.BOT_ID;
const BOT_SECRET = process.env.BOT_SECRET;

// リクエストボディをJSON形式で受け取れるように設定
app.use(express.json());

// Callback URLのパスを指定
app.post('/lineworks/callback', async (req, res) => {
    // セキュリティのため、リクエストの検証ロジックをここに実装
    // 'X-WORKS-Signature' ヘッダーと Bot Secret を使って署名を検証します。

    const event = req.body;
    
    // メッセージイベントか確認
    if (event.type === 'message') {
        const messageContent = event.content.text;
        const senderId = event.source.userId;

        let replyText = '「予約」または「確認」と入力してください。';

        if (messageContent.includes('予約')) {
            replyText = '診察のご予約ですね。ご希望の診察科をお選びください。';
        } else if (messageContent.includes('確認')) {
            replyText = '現在の予約状況をお調べします。';
        }

        // LINE WORKS Messaging APIを使って返信
        try {
            await axios.post(`https://api.line.worksmobile.com/bot/v1/message/push`, {
                "userId": senderId,
                "content": {
                    "type": "text",
                    "text": replyText
                }
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${BOT_SECRET}`, // Bot Secret を使って認証
                    'x-works-botid': BOT_ID
                }
            });
            console.log(`返信成功: ${replyText}`);
        } catch (error) {
            console.error('返信エラー:', error.response ? error.response.data : error.message);
        }
    }

    res.sendStatus(200); // LINE WORKSに成功を通知
});

// サーバー起動
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});