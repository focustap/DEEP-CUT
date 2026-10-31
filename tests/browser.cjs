// Browser regressions use the real UI and a mocked judge; no backend secrets needed.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const server = http.createServer((req, res) => {
  const file = path.resolve(root, "." + new URL(req.url, "http://localhost").pathname.replace(/\/$/, "/index.html"));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png" };
    res.setHeader("Content-Type", mime[path.extname(file)] || "text/plain");
    res.end(data);
  });
});

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const revision = "a6c56ae4f5616070c1adfa37bbcfb62483c9ec6a";
    await page.route("**/revision.js", route => route.fulfill({
      contentType: "text/javascript", body: `window.DEEP_CUT_REVISION = "${revision}";`
    }));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    fs.mkdirSync(path.join(root, "test-output"), { recursive: true });
    assert(await page.locator(".home-drill").evaluate(async img => {
      await img.decode();
      const canvas = document.createElement("canvas"); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0);
      return [[0,0],[255,0],[0,383],[255,383],[10,180]].every(([x,y]) => ctx.getImageData(x,y,1,1).data[3] === 0);
    }), "PNG has genuine transparent pixels outside the drill");
    await page.screenshot({ path: path.join(root, "test-output/home.png"), fullPage: true });
    assert.equal(await page.locator("#buildRevision").textContent(), "COMMIT a6c56ae");
    assert.equal(await page.locator("#buildRevision").getAttribute("href"), `https://github.com/focustap/DEEP-CUT/commit/${revision}`);
    await page.clock.install();
    await page.click("#startBtn");
    const answerFor = tier => page.evaluate(t => {
      const category = window.DEEP_CUT_DATA.find(c => c.prompt === document.getElementById("prompt").textContent);
      return category.tiers[t][0].split("~")[0];
    }, tier);
    const readScene = () => page.evaluate(() => ({
      score: Number(document.getElementById("score").textContent.replaceAll(",", "")),
      number: Number(document.getElementById("gaugeNumber").textContent.replace(/[^0-9]/g, "")),
      total: Number(document.getElementById("shaftTotal").textContent.split(" /")[0].replaceAll(",", "")),
      offset: -new DOMMatrixReadOnly(getComputedStyle(document.getElementById("terrain")).transform).m42 || 0
    }));
    const answer = async text => {
      await page.fill("#answer", text);
      await page.locator("#answerForm").evaluate(form => form.requestSubmit());
    };
    const inLayout = async () => {
      const question = await page.locator(".question-card").boundingBox();
      const drill = await page.locator("#gaugeDrill").boundingBox();
      assert(drill.y >= question.y + question.height, "drill below question");
      const world = await page.locator("#excavationWorld").boundingBox();
      const viewport = page.viewportSize();
      assert.deepEqual(world, { x: 0, y: 0, width: viewport.width, height: viewport.height }, "ground fills viewport");
      assert.equal(await page.locator(".gauge").evaluate(el => getComputedStyle(el).backgroundColor), "rgba(0, 0, 0, 0)", "no drill panel");
      assert.equal(await page.locator(".gauge-drill").evaluate(el => getComputedStyle(el).backgroundColor), "rgba(0, 0, 0, 0)", "no sprite backdrop");
      assert(Math.abs(drill.x + drill.width / 2 - (question.x + question.width / 2)) < 2, "drill centered");
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal overflow");
      assert(await page.locator(".question-card").evaluate(el => parseFloat(getComputedStyle(el).paddingLeft) >= 16), "question card retains spacing");
    };
    await inLayout();
    let depth = 0;
    for (const [tier, points] of [10, 20, 50, 100, 200].entries()) {
      await answer(await answerFor(tier));
      await page.clock.runFor(200);
      const nextButton = await page.locator("#nextBtn").boundingBox();
      const earned = await page.locator("#earnedPoints").boundingBox();
      assert(nextButton.y >= earned.y + earned.height, "next button stays clear of reward text");
      const partial = await readScene();
      assert(partial.score > depth && partial.score < depth + points, "counter interpolates");
      assert.equal(partial.score, partial.number);
      assert.equal(partial.score, partial.total);
      const offsetError = Math.abs(partial.offset - ((partial.score * 2.4) % 640));
      assert(Math.min(offsetError, Math.abs(640 - offsetError)) <= 1.3, "ground follows counter");
      if (points === 200) {
        await page.locator("#gauge").screenshot({ path: path.join(root, "test-output/deep-cut.png") });
      }
      depth += points;
      await page.clock.runFor(1800);
      assert.equal((await readScene()).score, depth);
      await page.clock.runFor(300);
      assert.equal(await page.locator("#timeLeft").textContent(), "0:30");
    }
    // More than one invalid answer is retryable, with no depth award.
    await page.evaluate(() => { window.DEEP_CUT_GRADING_URL = ""; });
    for (const text of ["not-a-valid-answer-1", "not-a-valid-answer-2"]) {
      await answer(text);
      assert(await page.locator("#unknownBox").isVisible());
      assert.equal((await readScene()).score, depth);
    }
    await page.clock.runFor(1000);
    assert.equal(await page.locator("#timeLeft").textContent(), "0:29");
    // A pending AI request pauses time; rejection resumes and permits another try.
    await page.evaluate(() => { window.DEEP_CUT_GRADING_URL = "https://judge.test/grade"; });
    let respond;
    await page.route("https://judge.test/grade", route => { respond = body => route.fulfill({ json: body }); });
    await answer("unknown AI answer");
    await page.waitForFunction(() => document.getElementById("submitBtn").disabled);
    await page.clock.runFor(5000);
    assert.equal(await page.locator("#timeLeft").textContent(), "0:29");
    await respond({ status: "invalid", message: "Try another." });
    await page.waitForFunction(() => !document.getElementById("submitBtn").disabled);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await answer("another AI answer");
    await page.waitForFunction(() => document.getElementById("submitBtn").disabled);
    await respond({ status: "accepted", tierIndex: 4, canonical: "AI accepted answer" });
    await page.waitForFunction(() => !document.getElementById("resultBox").hidden);
    depth += 200;
    assert.equal((await readScene()).score, depth, "reduced motion is immediate");
    assert.equal(await page.locator(".gauge .drill-sprite").evaluate(el => getComputedStyle(el).animationName), "none");
    await page.clock.runFor(2300);
    // The existing 30-second deadline still expires and automatically progresses.
    await page.clock.runFor(30000);
    assert.equal(await page.locator("#rarityName").textContent(), "TIME'S UP!");
    assert.equal((await readScene()).score, depth);
    await page.clock.runFor(1700);
    assert.equal(await page.locator("#timeLeft").textContent(), "0:30");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await answer(await answerFor(4));
    await page.clock.runFor(100);
    await page.click("#nextBtn");
    await answer(await answerFor(4));
    depth += 400;
    await page.clock.runFor(1900);
    assert.equal((await readScene()).score, depth, "rapid advances preserve all awarded depth");
    assert(Math.abs((await readScene()).offset - ((depth * 2.4) % 640)) < .1, "texture wraps");
    await page.clock.runFor(300);
    fs.mkdirSync(path.join(root, "test-output"), { recursive: true });
    for (const width of [1280, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
      await inLayout();
      if (width <= 390) {
        const box = await page.locator("#gaugeDrill").boundingBox();
        assert(box.y + box.height < 844, "mobile drill stays visible below question");
      }
      await page.screenshot({ path: path.join(root, `test-output/game-${width}.png`), fullPage: true });
    }
    await page.click("#skipBtn");
    assert(await page.locator("#endScreen").isVisible());
    assert.equal(await page.locator("#endScore").textContent(), depth.toLocaleString("en-US"));
    await page.click("#againBtn");
    assert.deepEqual(await readScene(), { score: 0, number: 0, total: 0, offset: 0 });
    await answer(await answerFor(4));
    await page.clock.runFor(100);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(() => document.getElementById("score").textContent === "200");
    assert.equal((await readScene()).score, 200, "changing motion preference settles in-flight dig");
    await page.clock.runFor(2300);
    for (let i = 1; i < 10; i += 1) {
      await answer(await answerFor(4));
      await page.clock.runFor(2300);
    }
    assert.equal(await page.locator("#endScore").textContent(), "2,000");
    assert.equal(await page.locator("#endBest").textContent(), "2,000 m");
    assert.equal(await page.locator("#endCuts").textContent(), "10");
    assert.deepEqual(errors, []);
    console.log("PASS: full-screen terrain, transparent sprite, five tiers, synchronized descent, retry/AI clock flow, timeout, rapid advance, wrapping, responsive layout, reduced motion, replay.");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
