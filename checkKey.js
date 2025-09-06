require('dotenv').config();

const rawKey = process.env.GS_PRIVATE_KEY;

// 改行が含まれているか確認
const hasRealNewline = rawKey.includes('\n');
console.log('① 改行が含まれているか:', hasRealNewline);

// 改行の数を数える
const newlineCount = (rawKey.match(/\n/g) || []).length;
console.log('② 改行の数:', newlineCount);

// 先頭と末尾を確認
console.log('③ 先頭30文字:', rawKey.slice(0, 30));
console.log('④ 末尾30文字:', rawKey.slice(-30));

// 改行を可視化（見やすくする）
console.log('⑤ 改行を \\n に変換した表示:');
console.log(rawKey.replace(/\n/g, '\\n'));