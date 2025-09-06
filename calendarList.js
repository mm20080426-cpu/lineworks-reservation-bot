const axios = require('axios');
const { getAccessToken } = require('./auth'); // JWT認証関数
require('dotenv').config();

/**
 * LINE WORKS カレンダー一覧を取得する
 */
async function listCalendars() {
  const accessToken = await getAccessToken();

  try {
    const res = await axios.get(`${process.env.LW_API_BASE_URL}/calendar/calendars`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const calendars = res.data.calendars;
    console.log('📅 利用可能なカレンダー一覧:');
    calendars.forEach((cal, index) => {
      console.log(`\n[${index + 1}]`);
      console.log(`📌 calendarId: ${cal.calendarId}`);
      console.log(`📝 name: ${cal.name}`);
      console.log(`👥 type: ${cal.type}`);
    });
  } catch (err) {
    console.error('❌ カレンダー取得失敗:', err.response?.data || err.message);
  }
}

listCalendars();