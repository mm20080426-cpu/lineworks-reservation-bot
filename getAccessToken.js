const jwt = require('jsonwebtoken');
const axios = require('axios');

async function getAccessToken() {
    const payload = {
        iss: process.env.CLIENT_ID,
        sub: process.env.SERVICE_ACCOUNT,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1時間有効
    };

    const token = jwt.sign(payload, process.env.PRIVATE_KEY, { algorithm: 'RS256' });

    try {
        const res = await axios.post('https://auth.worksmobile.com/oauth2/v2.0/token', new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwtToken,
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            scope: process.env.SCOPE
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        return res.data.access_token;
    } catch (error) {
        console.error('アクセストークン取得失敗:', error.response ? error.response.data : error.message);
        throw error;
    }
}
