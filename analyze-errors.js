const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./error-audit-report.json', 'utf8'));

console.log('=== ERROR AUDIT SUMMARY ===\n');
console.log(`Total Files: ${data.totalFiles}`);
console.log(`Total Errors: ${data.totalErrors}\n`);

console.log('=== TOP EXCEPTION TYPES ===');
const types = Object.entries(data.exceptionTypes)
  .map(([type, info]) => ({ type, count: info.count, occurrences: info.occurrences }))
  .sort((a, b) => b.count - a.count);

types.forEach((t, i) => {
  console.log(`${i+1}. ${t.type}: ${t.count} (${((t.count/data.totalErrors)*100).toFixed(1)}%)`);
});

console.log('\n=== MOST COMMON ERROR MESSAGES ===');
const allMessages = {};
types.forEach(type => {
  type.occurrences.forEach(occ => {
    if (occ.message) {
      const key = occ.message.trim();
      if (!allMessages[key]) {
        allMessages[key] = { count: 0, exceptionType: occ.exceptionType, examples: [] };
      }
      allMessages[key].count++;
      if (allMessages[key].examples.length < 3) {
        allMessages[key].examples.push(occ.file);
      }
    }
  });
});

const sortedMessages = Object.entries(allMessages)
  .sort((a, b) => b[1].count - a[1].count)
  .slice(0, 20);

sortedMessages.forEach(([msg, info], i) => {
  console.log(`${i+1}. "${msg}" - ${info.count} times (${info.exceptionType})`);
  console.log(`   Files: ${info.examples.slice(0, 2).join(', ')}`);
});

console.log('\n=== SERVICES WITH MOST ERRORS ===');
const fileErrors = {};
types.forEach(type => {
  type.occurrences.forEach(occ => {
    if (!fileErrors[occ.file]) {
      fileErrors[occ.file] = 0;
    }
    fileErrors[occ.file]++;
  });
});

const sortedFiles = Object.entries(fileErrors)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15);

sortedFiles.forEach(([file, count], i) => {
  console.log(`${i+1}. ${file}: ${count} errors`);
});
