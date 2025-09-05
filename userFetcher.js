const axios = require('axios');
require('dotenv').config();

/**
 * userIdからaccountIdを取得する関数
 */
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
    console.log(`[INFO] accountId取得: ${accountId}`);
    return accountId;
  } catch (error) {
    const errorMsg = error.response?.data || error.message;
    console.error(`[ERROR] accountId取得失敗: ${errorMsg}`);
    return null;
  }
}

module.exports = getAccountIdFromUserId;