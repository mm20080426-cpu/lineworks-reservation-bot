const axios = require('axios');
const { getAccessToken } = require('./auth');
require('dotenv').config();

/**
 * LINE WORKS カレンダーに予定を登録する
 * @param {string} userId - LINE WORKS の userId
 * @param {string} title - 予定タイトル（例: "診察予約：山田太郎"）
 * @param {string} startDateTime - ISO形式の開始日時（例: "2025-09-11T10:00:00+09:00"）
 * @param {string} endDateTime - ISO形式の終了日時（例: "2025-09-11T10:15:00+09:00"）
 * @param {string} description - 備考など
 * @returns {Promise<void>}
 */
async function createCalendarEvent(userId, title, startDateTime, endDateTime, description) {
  const accessToken = await getAccessToken();
  const calendarId = process.env.LW_CALENDAR_ID || 'cal-default-id'; // 必要に応じて .env に追加

  const payload = {
    calendarId,
    title,
    start: { dateTime: startDateTime },
    end: { dateTime: endDateTime },
    location: '診察室A',
    description,
    attendees: [{ memberId: userId }]
  };

  try {
    const res = await axios.post(`${process.env.LW_API_BASE_URL}/calendar/schedules`, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('[INFO] カレンダー登録成功:', res.data);
  } catch (err) {
    console.error('[ERROR] カレンダー登録失敗:', err.response?.data || err.message);
    throw err;
  }
}

module.exports = { createCalendarEvent };