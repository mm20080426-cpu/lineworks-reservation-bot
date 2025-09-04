const { writeReservationData } = require('./sheetsWriter');

const testData = [
  ['2025/09/05', '田中太郎', '10:00'],
];

writeReservationData(testData);