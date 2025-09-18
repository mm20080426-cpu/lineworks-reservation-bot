const axios = require('axios');
require('dotenv').config();

async function getAccountIdFromUserId(userId, accessToken) {
  try {
    const baseUrl = process.env.LW_API_BASE_URL || 'https://www.worksapis.com';
    const url = `${baseUrl}/v1.0/users/${encodeURIComponent(userId)}`;

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };

    const { data } = await axios.get(url, { headers });

    const accountId = data?.accountId || data?.email;
    if (!accountId) {
      console.warn(`[WARN] accountIdが取得できません（userId: ${userId}）。email: ${data?.email}`);
    } else {
      console.log(`[INFO] accountId取得成功（userId: ${userId}）: ${accountId}`);
    }

    return accountId;
  } catch (error) {
    const errorMsg = error.response?.data || error.message;
    console.error(`[ERROR] accountId取得失敗（userId: ${userId}）:`, errorMsg);
    return null;
  }
}

module.exports = getAccountIdFromUserId;