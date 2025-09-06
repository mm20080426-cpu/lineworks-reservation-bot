const axios = require('axios');
const { getAccessToken } = require('./auth');
require('dotenv').config();

/**
 * LINE WORKS のカレンダー一覧を取得する
 * @returns {Promise<void>}
 */
async function fetchCalendarList() {
  const accessToken = await getAccessToken();

  try {
    const res = await axios.get(`${process.env.LW_API_BASE_URL}/calendar/calendars`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const calendars = res.data.calendars;
    calendars.forEach(cal => {
      console.log('📅 カレンダー名:', cal.name);
      console.log('🆔 calendarId:', cal.calendarId);
      console.log('🔧 タイプ:', cal.type);
      console.log('-------------------------');
    });
  } catch (err) {
    console.error('[ERROR] カレンダー一覧取得失敗:', err.response?.data || err.message);
  }
}

fetchCalendarList();