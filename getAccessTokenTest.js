const fetchAccessToken = require('./tokenFetcher');

(async () => {
  try {
    const token = await fetchAccessToken();
    console.log('✅ アクセストークン取得成功:', token);
  } catch (err) {
    console.error('❌ JWT 認証エラー:', err.response?.data || err.message);
  }
})();