// End-to-end coverage of app.js in a real browser. This is the only place the DOM-building code
// (row pairing, the collapse/expand of unchanged runs, the three granularities) actually gets
// exercised — there is no unit-test harness for it, on purpose: it is DOM manipulation, and a
// headless browser is a truer test of it than a jsdom shim would be.
const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
});

async function compare(page, left, right) {
  await page.fill("#left-text", left);
  await page.fill("#right-text", right);
  await page.click("#compare-btn");
  await expect(page.locator("#result")).toBeVisible();
}

test("identical input reports no differences", async ({ page }) => {
  await compare(page, "same\ntext\nhere\n", "same\ntext\nhere\n");
  await expect(page.locator("#diff-viewport")).toContainText("No differences.");
});

test("line diff, split view: shows both an added and a removed row", async ({ page }) => {
  await compare(page, "alpha\nbravo\ncharlie\n", "alpha\nBRAVO\ncharlie\n");
  await expect(page.locator("#summary")).toContainText("added");
  await expect(page.locator("#summary")).toContainText("removed");
  await expect(page.locator(".split-table .row-del")).toHaveCount(1);
  await expect(page.locator(".split-table .row-add")).toHaveCount(1);
  await expect(page.locator(".split-table")).toContainText("bravo");
  await expect(page.locator(".split-table")).toContainText("BRAVO");
});

test("line diff, unified view: shows +/- lines", async ({ page }) => {
  await page.click('.seg[data-layout="unified"]');
  await compare(page, "alpha\nbravo\ncharlie\n", "alpha\nBRAVO\ncharlie\n");
  await expect(page.locator(".unified-line.del")).toHaveCount(1);
  await expect(page.locator(".unified-line.add")).toHaveCount(1);
});

test("word diff highlights only the changed word", async ({ page }) => {
  await page.click('.seg[data-granularity="word"]');
  await compare(page, "the quick fox", "the slow fox");
  await expect(page.locator("ins.word-add")).toHaveText("slow");
  await expect(page.locator("del.word-del")).toHaveText("quick");
});

test("character diff highlights only the changed character", async ({ page }) => {
  await page.click('.seg[data-granularity="char"]');
  await compare(page, "cat", "car");
  await expect(page.locator("span.char-add")).toHaveText("r");
  await expect(page.locator("span.char-del")).toHaveText("t");
});

test("granularity switch to word/char disables the layout toggle", async ({ page }) => {
  await page.click('.seg[data-granularity="word"]');
  await expect(page.locator('.seg[data-layout="split"]')).toBeDisabled();
  await expect(page.locator('.seg[data-layout="unified"]')).toBeDisabled();
  await page.click('.seg[data-granularity="line"]');
  await expect(page.locator('.seg[data-layout="split"]')).toBeEnabled();
});

test("ignore whitespace treats a whitespace-only line edit as unchanged", async ({ page }) => {
  await page.check("#ignore-whitespace");
  await compare(page, "a\n  spaced out  \nb\n", "a\nspaced out\nb\n");
  await expect(page.locator("#diff-viewport")).toContainText("No differences.");
});

test("ignore case treats a case-only change as unchanged", async ({ page }) => {
  await page.check("#ignore-case");
  await compare(page, "Hello World\n", "hello world\n");
  await expect(page.locator("#diff-viewport")).toContainText("No differences.");
});

test("hiding unchanged lines collapses a long common run, and expanding it restores correct line numbers", async ({ page }) => {
  // 20 identical lines, then one changed line, then 20 more identical lines: long enough on both
  // sides of the change that markCollapsible() must fold each run down to a collapse-row.
  const common = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
  const left = `${common}\nCHANGED\n${common}\n`;
  const right = `${common}\nchanged\n${common}\n`;

  await compare(page, left, right);
  const collapseRows = page.locator(".collapse-row");
  await expect(collapseRows).toHaveCount(2);

  // Expand the first collapsed block and check the line numbers it renders are the real ones
  // for that block, not whatever the shared counter had reached by the time of the click — this
  // is the exact bug class this test exists to catch.
  await collapseRows.first().click();
  await expect(page.locator(".collapse-row")).toHaveCount(1);
  const firstRestoredLineNumber = await page
    .locator(".split-table tr")
    .nth(0)
    .locator("td.ln")
    .first()
    .innerText();
  expect(firstRestoredLineNumber.trim()).toBe("1");
});

test("hide-unchanged unchecked renders every line with no collapse row", async ({ page }) => {
  await page.uncheck("#hide-unchanged");
  const common = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
  await compare(page, `${common}\nCHANGED\n${common}\n`, `${common}\nchanged\n${common}\n`);
  await expect(page.locator(".collapse-row")).toHaveCount(0);
  await expect(page.locator(".split-table tr")).toHaveCount(41);
});

test("open file loads its contents into the pane and shows the file name", async ({ page }) => {
  await page.setInputFiles("#left-file", {
    name: "sample.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("loaded from disk\n"),
  });
  await expect(page.locator("#left-text")).toHaveValue("loaded from disk\n");
  await expect(page.locator("#left-file-name")).toHaveText("sample.txt");
});

test("copy diff writes a plain-text +/- rendering to the clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await compare(page, "alpha\nbravo\n", "alpha\nBRAVO\n");
  await page.click("#copy-btn");
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("- bravo");
  expect(clip).toContain("+ BRAVO");
});

test("back button returns to the editable input view", async ({ page }) => {
  await compare(page, "a\n", "b\n");
  await page.click("#back-btn");
  await expect(page.locator("#input-view")).toBeVisible();
  await expect(page.locator("#result")).toBeHidden();
});
