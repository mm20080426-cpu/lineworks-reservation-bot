const fs = require('fs');
const path = require('path');

// 仮の保存先（JSONファイルなど）※後でDBに変更可能
const RESERVATION_FILE = path.join(__dirname, 'reservations.json');

/**
 * 予約データを読み込む
 */
function loadReservations() {
  if (!fs.existsSync(RESERVATION_FILE)) return [];
  const data = fs.readFileSync(RESERVATION_FILE, 'utf-8');
  return JSON.parse(data);
}

/**
 * 予約データを保存する
 */
function saveReservations(reservations) {
 try {
    fs.writeFileSync(RESERVATION_FILE, JSON.stringify(reservations, null, 2));
    console.log('✅ 予約データを保存しました');
  } catch (err) {
    console.error('❌ 保存エラー:', err.message);
  }
}

/**
 * 予約を登録する
 * @param {string} userId - ユーザーID
 * @param {string} timeSlot - 予約時間（例: "10:00〜10:30"）
 * @returns {string} 結果メッセージ
 */
function registerReservation(userId, timeSlot) {
  const reservations = loadReservations();

  // 重複チェック
  const alreadyReserved = reservations.find(
    (r) => r.userId === userId || r.timeSlot === timeSlot
  );
  if (alreadyReserved) {
    return '⚠️ すでに予約済みです。他の時間帯を選んでください。';
  }

  // 予約登録
  reservations.push({ userId, timeSlot, timestamp: new Date().toISOString() });
  saveReservations(reservations);

  return `✅ ${timeSlot} の予約を受け付けました！`;
}

module.exports = {
  registerReservation,
};