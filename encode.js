const fs = require('fs');
const raw = fs.readFileSync('google-credentials.json', 'utf8');
const encoded = Buffer.from(raw).toString('base64');
console.log(encoded);