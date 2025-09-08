require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const {
  registerReservation,
  cancelReservation,
  getReservationsByDate,
  getAvailableSlots // ← 追加済み！
} = require('./reservationService');
const { getAvailableTimeSlots } = require('./calendarUtils');
const fetchAccessToken = require('./tokenFetcher');
const getAccountIdFromUserId = require('./userFetcher');

const app = express();
app.use(express.json());

const BOT_ID = process.env.LW_BOT_ID;
const BOT_SECRET = process.env.LW_BOT_SECRET;

// ✅ Render環境用：google-credentials.json を復元
const base64 = process.env.GOOGLE_CREDENTIALS_BASE64;
if (base64) {
  try {
    const json = Buffer.from(base64, 'base64').toString('utf8');
    fs.writeFileSync('google-credentials.json', json);
    console.log('[INFO] google-credentials.json を復元しました');
  } catch (err) {
    console.error('[ERROR] google-credentials.json の復元失敗:', err);
  }
}

// ユーザー状態管理
const userState = new Map();

// 署名検証
function verifySignature(reqBody, signatureHeader, botSecret) {
  const bodyString = JSON.stringify(reqBody);
  const hmac = crypto.createHmac('sha256', botSecret);
  hmac.update(bodyString);
  const expectedSignature = hmac.digest('base64');
  return expectedSignature === signatureHeader;
}

// 日付抽出関数
function extractDate(messageText) {
  const fullDateRegex = /(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?/;
  const shortDateRegex = /(\d{1,2})[\/月](\d{1,2})日?/;

  let yyyy, mm, dd;
  const fullMatch = messageText.match(fullDateRegex);
  if (fullMatch) {
    yyyy = fullMatch[1];
    mm = fullMatch[2].padStart(2, '0');
    dd = fullMatch[3].padStart(2, '0');
  } else {
    const shortMatch = messageText.match(shortDateRegex);
    if (shortMatch) {
      yyyy = new Date().getFullYear();
      mm = shortMatch[1].padStart(2, '0');
      dd = shortMatch[2].padStart(2, '0');
    }
  }

  return yyyy && mm && dd ? `${yyyy}-${mm}-${dd}` : null;
}

// ✅ 時間抽出関数（予約テキストから "10:00" のような時間を取り出す）
function extractTimeFromReservation(reservationText) {
  const match = reservationText.match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : null;
}

// Webhook受信
app.post('/lineworks/callback', async (req, res) => {
  const signatureHeader = req.headers['x-works-signature'];
  if (!verifySignature(req.body, signatureHeader, BOT_SECRET)) {
    console.warn('[WARN] 署名検証失敗');
    return res.sendStatus(403);
  }

  const event = req.body;
  if (event.type !== 'message') return res.sendStatus(200);

  const messageText = event.content.text.trim();
  const userId = event.source?.userId;
  const state = userState.get(userId);
  let replyText = '';

  // ✅ ログ追加：受信内容とステート確認
  console.log('[DEBUG] 受信メッセージ:', messageText);
  console.log('[DEBUG] ユーザーID:', userId);
  console.log('[DEBUG] 現在のステート:', state);

  // ✅ メニュー表示
  if (messageText === '開始') {
    userState.set(userId, { step: 'menu' });

    const accessToken = await fetchAccessToken();
    const accountId = await getAccountIdFromUserId(userId, accessToken);

    const replyText =
      '👋 はじめまして！以下のメニューから選んでください：\n' +
      '・予約\n' +
      '・キャンセル\n' +
      '・一覧\n' +
      '・空き\n' +
      '※ 文字で入力してください（例：「予約」）';

    try {
      await axios.post(
        `https://www.worksapis.com/v1.0/bots/${BOT_ID}/users/${accountId}/messages`,
        {
          content: {
            type: 'text',
            text: replyText
          }
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (err) {
      console.error('[ERROR] メニュー送信失敗:', err.response?.data || err.message);
    }

    return res.sendStatus(200);
  }

const { getAvailableTimeSlots, normalizeDate } = require('./calendarUtils');

// ✅ 予約フロー
if (messageText === '予約') {
  userState.set(userId, { step: 'awaitingDate' });
  replyText = '📅 日付を入力してください（例：9/11 または 2025/9/11）';

} else if (state?.step === 'awaitingDate') {
  const selectedDate = extractDate(messageText);
  if (!selectedDate) {
    replyText = '⚠️ 日付の形式が正しくありません。もう一度入力してください。';
  } else {
    const normalizedDate = normalizeDate(selectedDate);

    const calendarSlots = getAvailableTimeSlots(normalizedDate);

    // ✅ 修正：nullではなく、空配列のみを休診日と判定
    if (!Array.isArray(calendarSlots)) {
      replyText = `🚫 ${selectedDate} は休診日です。別の日を選んでください。`;
    } else {
      const availableSlots = await getAvailableSlots(normalizedDate);

      const filteredSlots = calendarSlots.filter(slot =>
        availableSlots.includes(slot.replace(/〜|～|-/g, '〜').trim())
      );

      if (filteredSlots.length === 0) {
        replyText = `🚫 ${selectedDate} は空き枠がありません。別の日を選んでください。`;
      } else {
        userState.set(userId, {
          step: 'dateSelected',
          selectedDate,
          normalizedDate,
          availableSlots: filteredSlots
        });

        replyText = `📅 ${selectedDate} の空き枠です。番号でお選びください。\n` +
                    filteredSlots.map((slot, i) => `${i + 1}. ${slot}`).join('\n');
      }
    }
  }
}else if (state?.step === 'dateSelected' && /^\d+$/.test(messageText)) {
  const index = parseInt(messageText) - 1;
  const selectedSlot = state.availableSlots[index];

  if (selectedSlot) {
    userState.set(userId, {
      ...state,
      step: 'awaitingName',
      selectedSlot
    });

    replyText = `✅ ${state.selectedDate} の ${selectedSlot} を選択しました。\n👤 お名前を入力してください。`;
  } else {
    replyText = `⚠️ 有効な番号を選択してください。`;
  }

} else if (state?.step === 'awaitingName') {
  const name = messageText;
  userState.set(userId, {
    ...state,
    step: 'awaitingNote',
    name
  });

  replyText = `📝 備考があれば入力してください（未入力でもOKです）。`;

} else if (state?.step === 'awaitingNote') {
  const note = messageText || 'なし';

  replyText = await registerReservation(
    userId,
    state.normalizedDate, // ← 修正ポイント：予約登録には統一済み日付を使う
    state.selectedSlot,
    state.name,
    note
  );

  userState.delete(userId);
}
// ✅ キャンセルフロー開始
else if (messageText === 'キャンセル') {
  userState.set(userId, { step: 'awaitingCancelDate' });
  replyText = '📅 キャンセルしたい日付を入力してください（例：9/11）';
}

// ✅ 日付入力 → 番号付き予約一覧を表示
else if (state?.step === 'awaitingCancelDate') {
  const cancelDate = extractDate(messageText);
  if (!cancelDate) {
    replyText = '⚠️ 日付の形式が正しくありません。もう一度入力してください。';
  } else {
    const reservationList = await getReservationsByDate(cancelDate);
    console.log('[DEBUG] キャンセル対象日の予約一覧:', reservationList);

    const numberedList = reservationList.map((item, index) => `${index + 1}. ${item}`);

    userState.set(userId, {
      step: 'awaitingCancelSelection',
      cancelDate,
      originalList: reservationList
    });

    replyText =
      `🕒 ${cancelDate} のキャンセルしたい予約を番号で選んでください（例：1）\n\n📋 予約一覧:\n` +
      (numberedList.length ? numberedList.join('\n') : '📭 予約はありません。');
  }
}

// ✅ 番号選択 → キャンセル実行
else if (state?.step === 'awaitingCancelSelection') {
  const selectedIndex = parseInt(messageText, 10) - 1;
  const originalList = state.originalList;

  if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= originalList.length) {
    replyText = '⚠️ 番号が正しくありません。もう一度入力してください（例：1）';
  } else {
    const selectedItem = originalList[selectedIndex];
    const cancelTime = extractTimeFromReservation(selectedItem);

    console.log('[DEBUG] キャンセル対象:', selectedItem);
    console.log('[DEBUG] 抽出された時間枠:', cancelTime);

    const cancelMessage = await cancelReservation(userId, state.cancelDate, cancelTime);
    console.log('[DEBUG] キャンセル結果メッセージ:', cancelMessage);

    await new Promise(resolve => setTimeout(resolve, 500));
    const updatedList = await getReservationsByDate(state.cancelDate);
    const numberedUpdatedList = updatedList.map((item, i) => `${i + 1}. ${item}`);

    replyText =
      `${cancelMessage}\n\n📋 最新の予約一覧:\n` +
      (numberedUpdatedList.length ? numberedUpdatedList.join('\n') : '📭 予約はありません。');

    userState.delete(userId);
  }
}


  // ✅ 一覧フロー
  else if (messageText === '一覧') {
    userState.set(userId, { step: 'awaitingListDate' });
    replyText = '📅 一覧を表示したい日付を入力してください（例：9/11 または 2025/9/11）';
  } else if (state?.step === 'awaitingListDate') {
    const listDate = extractDate(messageText);
    if (!listDate) {
      replyText = '⚠️ 日付の形式が正しくありません。もう一度入力してください。';
    } else {
      replyText = await getReservationsByDate(listDate);
      userState.delete(userId);
    }
  }

  // ✅ 空きフロー（修正済み！）
  else if (messageText === '空き') {
    userState.set(userId, { step: 'awaitingFreeDate' });
    replyText = '📅 空き状況を確認したい日付を入力してください（例：9/11）';
  } else if (state?.step === 'awaitingFreeDate') {
    const freeDate = extractDate(messageText);
    if (!freeDate) {
      replyText = '⚠️ 日付の形式が正しくありません。もう一度入力してください。';
    } else {
      const slots = await getAvailableSlots(freeDate); // ← calendar.json + Sheets連携済みの空き枠取得
      if (!slots || slots.length === 0) {
        replyText = `🚫 ${freeDate} は空き枠がありません。別の日を選んでください。`;
      } else {
        replyText = `🟢 ${freeDate} の空き枠です：\n` +
                    slots.map((slot, i) => `${i + 1}. ${slot}`).join('\n');
      }
      userState.delete(userId);
    }
  }

  // ✅ その他の入力
  else {
    replyText = '🤖 「開始」でメニューを表示できます。';
  }

  // ✅ LINE WORKSへ返信
  try {
    const accessToken = await fetchAccessToken();
    const accountId = await getAccountIdFromUserId(userId, accessToken);

    const finalText = Array.isArray(replyText) ? replyText.join('\n') : replyText;

// ✅ ログ追加：送信内容確認
    console.log('[DEBUG] 送信予定の replyText:', finalText);

    if (!finalText || typeof finalText !== 'string' || finalText.trim() === '') {
      throw new Error('送信内容が空または不正です');
    }

    await axios.post(
      `https://www.worksapis.com/v1.0/bots/${BOT_ID}/users/${accountId}/messages`,
      {
        content: {
          type: 'text',
          text: finalText
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('[INFO] LINE WORKSへの返信成功');
  } catch (err) {
    console.error('[ERROR] LINE WORKSへの返信失敗:', err.response?.data || err.message);
  }

  res.sendStatus(200);
});

// ✅ サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[INFO] サーバー起動完了（ポート: ${PORT}）`);
});