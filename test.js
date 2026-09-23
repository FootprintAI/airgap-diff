// Smoke test for the vendored diff library. Run with: node test.js
//
// This does not exercise app.js's DOM-building code directly (that needs a real browser — see
// the Playwright check in .github/workflows/ci.yml for that). What it does check is the thing a
// silent vendoring mistake would actually break: that vendor/diff.min.js is the real jsdiff UMD
// build, loads under CommonJS, and its line/word/char diff functions return the shapes app.js
// assumes (an array of {value, added, removed} parts).
"use strict";

const assert = require("node:assert");
const Diff = require("./vendor/diff.min.js");

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

check("diffLines exposes the expected shape", () => {
  const parts = Diff.diffLines("a\nb\nc\n", "a\nx\nc\n");
  assert.ok(Array.isArray(parts));
  for (const p of parts) {
    assert.strictEqual(typeof p.value, "string");
  }
  assert.ok(parts.some((p) => p.removed));
  assert.ok(parts.some((p) => p.added));
});

check("diffLines reports no change for identical input", () => {
  const parts = Diff.diffLines("same\ntext\n", "same\ntext\n");
  assert.ok(parts.every((p) => !p.added && !p.removed));
});

check("diffLines ignoreWhitespace collapses a whitespace-only edit", () => {
  const parts = Diff.diffLines("a\n b \n", "a\nb\n", { ignoreWhitespace: true });
  assert.ok(parts.every((p) => !p.added && !p.removed), JSON.stringify(parts));
});

check("diffWordsWithSpace isolates the single changed word and keeps spacing", () => {
  const parts = Diff.diffWordsWithSpace("the quick fox", "the slow fox");
  // Concatenating every part NOT marked removed reconstructs the "new" string exactly; every
  // part NOT marked added reconstructs the "old" string exactly. That is the actual contract
  // app.js's renderInlineDiff() relies on.
  assert.strictEqual(parts.filter((p) => !p.removed).map((p) => p.value).join(""), "the slow fox");
  assert.strictEqual(parts.filter((p) => !p.added).map((p) => p.value).join(""), "the quick fox");
  assert.ok(parts.some((p) => p.removed && p.value.includes("quick")));
  assert.ok(parts.some((p) => p.added && p.value.includes("slow")));
});

check("diffChars finds a single-character change", () => {
  const parts = Diff.diffChars("cat", "car");
  assert.ok(parts.some((p) => p.removed && p.value === "t"));
  assert.ok(parts.some((p) => p.added && p.value === "r"));
});

check("diffLines parts reconstruct both inputs exactly (the invariant app.js's row-pairing relies on)", () => {
  const left = "one\ntwo\nthree\nfour\n";
  const right = "one\nTWO\nTHREE\nfour\nfive\n";
  const parts = Diff.diffLines(left, right);
  assert.strictEqual(parts.filter((p) => !p.removed).map((p) => p.value).join(""), right);
  assert.strictEqual(parts.filter((p) => !p.added).map((p) => p.value).join(""), left);
});

check("diffLines ignoreCase treats differently-cased identical lines as unchanged", () => {
  const parts = Diff.diffLines("Hello\n", "hello\n", { ignoreCase: true });
  assert.ok(parts.every((p) => !p.added && !p.removed), JSON.stringify(parts));
});

console.log(`\n${passed} passed`);
