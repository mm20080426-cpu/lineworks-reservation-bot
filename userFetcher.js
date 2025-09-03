// userFetcher.js
const axios = require('axios');

/**
 * userIdからaccountIdを取得する関数
 */
async function getAccountIdFromUserId(userId, accessToken) {
  try {
    const response = await axios.get(`https://www.worksapis.com/v1.0/users/${encodeURIComponent(userId)}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const accountId = response.data?.accountId || response.data?.email;
    console.log('✅ accountId取得成功:', accountId);
    return accountId;
  } catch (error) {
    console.error('❌ accountId取得失敗:', error.response?.data || error.message);
    return null;
  }
}

module.exports = getAccountIdFromUserId;