const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const words = JSON.parse(fs.readFileSync(path.join(root, "data", "words.json"), "utf8"));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function listForSerial(serial) {
  return ((serial - 1) % 30) + 1;
}

function reviewSerials(dayNumber) {
  return [14, 6, 3, 1, 0]
    .map((offset) => dayNumber - offset)
    .filter((serial) => serial > 0)
    .sort((a, b) => a - b);
}

assert(words.listCount === 30, "Expected 30 lists");
assert(words.wordCount === 2100, "Expected 2100 words");
assert(words.anomalies.length === 0, "Expected no extraction anomalies");

for (const list of words.lists) {
  assert(list.words.length === 70, `List ${list.listId} should have 70 words`);
  list.words.forEach((word, index) => {
    assert(word.index === index + 1, `Bad index in List ${list.listId}`);
    assert(word.word && word.phonetic && word.meaning, `Incomplete word ${word.id}`);
    assert(word.example && word.example.en && word.example.zh, `Missing example for ${word.id}`);
  });
}

assert(words.lists[0].words[0].word === "summary", "List 01 sample mismatch");
assert(words.lists[14].words[0].word === "meadow", "List 15 sample mismatch");
assert(words.lists[29].words[69].word === "leap", "List 30 sample mismatch");

assert(JSON.stringify(reviewSerials(1).map(listForSerial)) === JSON.stringify([1]), "Day 1 review mismatch");
assert(JSON.stringify(reviewSerials(2).map(listForSerial)) === JSON.stringify([1, 2]), "Day 2 review mismatch");
assert(JSON.stringify(reviewSerials(3).map(listForSerial)) === JSON.stringify([2, 3]), "Day 3 review mismatch");
assert(listForSerial(30) === 30, "Day 30 list mismatch");
assert(listForSerial(31) === 1, "Day 31 loop mismatch");
assert(listForSerial(45) === 15, "Day 45 loop mismatch");

["index.html", "manifest.webmanifest", "sw.js", "app/app.js", "app/styles.css"].forEach((file) => {
  assert(fs.existsSync(path.join(root, file)), `${file} is missing`);
});

console.log("Validation passed: data, schedule, and PWA files are ready.");
