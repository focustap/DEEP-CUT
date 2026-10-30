(() => {
  "use strict";

  const TOTAL_ROUNDS = 10;
  const QUESTION_MS = 30000;
  const RESULT_MS = 2200;
  const MAX_DEPTH = TOTAL_ROUNDS * 200;
  const BEST_KEY = "deep-cut-personal-best-v1";
  const TIERS = [
    { label: "COMMON", slug: "common", points: 10, color: "#a9b6c7" },
    { label: "UNCOMMON", slug: "uncommon", points: 20, color: "#67c999" },
    { label: "RARE", slug: "rare", points: 50, color: "#66b6ff" },
    { label: "EPIC", slug: "epic", points: 100, color: "#c99bff" },
    { label: "DEEP CUT!", slug: "deep", points: 200, color: "#ffd067" }
  ];

  const $ = (id) => document.getElementById(id);
  const startScreen = $("startScreen");
  const gameScreen = $("gameScreen");
  const endScreen = $("endScreen");
  const bank = Array.isArray(window.DEEP_CUT_DATA) ? window.DEEP_CUT_DATA : [];

  // Each answer is stored once with optional accepted spellings separated by "~".
  // There is deliberately no AI roulette: the same answer always scores the same.
  const norm = (value) => String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]/g, "");

  const indices = new Map();
  bank.forEach((category) => {
    const index = new Map();
    category.tiers.forEach((answers, tierIndex) => {
      answers.forEach((entry) => {
        const aliases = entry.split("~").map((item) => item.trim()).filter(Boolean);
        const canonical = aliases[0];
        aliases.forEach((name) => {
          const key = norm(name);
          // If an alias is mistakenly duplicated, preserve the first tier.
          if (key && !index.has(key)) index.set(key, { canonical, tierIndex });
        });
      });
    });
    indices.set(category.id, index);
  });

  function readBest() {
    try {
      const value = Number(localStorage.getItem(BEST_KEY));
      return Number.isFinite(value) && value >= 0 ? value : 0;
    } catch (_) {
      return 0;
    }
  }
  function writeBest(value) {
    try { localStorage.setItem(BEST_KEY, String(value)); } catch (_) { /* Private browsing may block storage. */ }
  }
  function shuffle(array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  let best = readBest();
  let deck = [];
  let round = 0;
  let depth = 0;
  let submitted = false;
  let checking = false;
  let history = [];
  let deepCuts = 0;
  let remainingMs = QUESTION_MS;
  let deadline = 0;
  let clockHandle = null;
  let nextHandle = null;
  let sceneHandle = null;
  let rejected = new Map();
  let runId = 0;

  function stopClock() {
    if (clockHandle !== null) clearInterval(clockHandle);
    clockHandle = null;
  }
  function clearAutoNext() {
    if (nextHandle !== null) clearTimeout(nextHandle);
    nextHandle = null;
  }
  function displayClock() {
    const secs = Math.ceil(Math.max(0, remainingMs) / 1000);
    $("timeLeft").textContent = "0:" + String(secs).padStart(2, "0");
    $("timeLeft").setAttribute("aria-label", secs + " seconds remaining");
    $("timerFill").style.width = Math.max(0, Math.min(100, 100 * remainingMs / QUESTION_MS)) + "%";
    $("timerWrap").classList.toggle("urgent", secs <= 10 && secs > 0);
  }
  function pauseClock() {
    if (clockHandle === null) return;
    remainingMs = Math.max(0, deadline - performance.now());
    stopClock();
    $("timerWrap").classList.add("paused");
    displayClock();
  }
  function tick() {
    remainingMs = Math.max(0, deadline - performance.now());
    displayClock();
    if (remainingMs <= 0) timeUp();
  }
  function resumeClock() {
    if (submitted) return;
    $("timerWrap").classList.remove("paused");
    if (remainingMs <= 0) { timeUp(); return; }
    deadline = performance.now() + remainingMs;
    stopClock();
    clockHandle = setInterval(tick, 80);
    displayClock();
  }
  function scheduleAdvance(delayMs) {
    clearAutoNext();
    const thisRun = runId;
    const thisRound = round;
    nextHandle = setTimeout(() => {
      if (thisRun === runId && thisRound === round && submitted) advance();
    }, delayMs);
  }
  function animateDig(points) {
    const scene = $("gauge");
    const terrain = $("terrain");
    // The drill stays centered while the rock moves upward beneath it.
    terrain.style.transform = "translateY(-" + Math.round(depth * 0.21) + "px)";
    scene.classList.remove("is-drilling");
    const feedback = $("sceneFeedback");
    feedback.classList.remove("active");
    feedback.textContent = "+" + points + " m";
    if (sceneHandle !== null) clearTimeout(sceneHandle);
    // Trigger CSS transitions even when rounds are graded in rapid succession.
    void scene.offsetWidth;
    scene.classList.add("is-drilling");
    feedback.classList.add("active");
    sceneHandle = setTimeout(() => {
      scene.classList.remove("is-drilling");
      feedback.classList.remove("active");
      sceneHandle = null;
    }, 1450);
  }

  function switchScreen(screen) {
    [startScreen, gameScreen, endScreen].forEach((item) => { item.hidden = item !== screen; });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function updateBest() {
    $("homeBest").textContent = best.toLocaleString() + " m";
    $("gameBest").textContent = best.toLocaleString();
    $("endBest").textContent = best.toLocaleString() + " m";
  }

  function renderDrill() {
    $("score").textContent = depth.toLocaleString();
    $("shaftTotal").textContent = depth.toLocaleString() + " / " + MAX_DEPTH.toLocaleString() + " m";
    $("gaugeNumber").textContent = depth.toLocaleString() + " m";
    // Keep the drill visually centered: only the terrain scrolls on a correct answer.
    $("terrain").style.transform = "translateY(-" + Math.round(depth * 0.21) + "px)";
    $("gauge").setAttribute("aria-label", depth + " meters deep");
  }

  function renderHistory() {
    const list = $("historyList");
    list.replaceChildren();
    if (!history.length) {
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = "Answers will appear here as you dig.";
      list.append(empty);
      return;
    }
    history.slice().reverse().forEach((item) => {
      const row = document.createElement("div");
      row.className = "history-entry";
      const number = document.createElement("span");
      number.textContent = String(item.number).padStart(2, "0");
      const name = document.createElement("b");
      name.textContent = item.answer;
      const tier = document.createElement("span");
      tier.textContent = item.tier ? item.tier.label : "SKIPPED";
      tier.style.color = item.tier ? item.tier.color : "#8ba1b3";
      const points = document.createElement("strong");
      points.textContent = "+" + (item.tier ? item.tier.points : 0) + " m";
      row.append(number, name, tier, points);
      list.append(row);
    });
  }

  function renderSegments() {
    const segments = $("segments");
    segments.replaceChildren();
    for (let i = 0; i < TOTAL_ROUNDS; i += 1) {
      const piece = document.createElement("span");
      piece.className = i < round ? "done" : i === round ? "current" : "";
      segments.append(piece);
    }
    segments.setAttribute("aria-label", "Question " + (round + 1) + " of " + TOTAL_ROUNDS);
  }

  function renderQuestion() {
    const category = deck[round];
    if (!category) { finishRun(); return; }
    stopClock();
    clearAutoNext();
    remainingMs = QUESTION_MS;
    rejected = new Map();
    submitted = false;
    checking = false;
    $("timerWrap").classList.remove("paused", "urgent");
    $("timerNotice").textContent = "Invalid answer? Keep guessing until one gets through.";
    $("unknownBox").textContent = "";
    $("submitBtn").textContent = "LOCK IN →";
    $("prompt").textContent = category.prompt;
    $("categoryNote").textContent = category.note;
    $("roundDisplay").textContent = "QUESTION " + String(round + 1).padStart(2, "0") + " / " + TOTAL_ROUNDS;
    $("roundHint").textContent = (TOTAL_ROUNDS - round - 1) + " questions after this";
    $("answer").value = "";
    $("answer").disabled = false;
    $("submitBtn").disabled = false;
    $("skipBtn").disabled = false;
    $("answerForm").hidden = false;
    $("unknownBox").hidden = true;
    $("resultBox").hidden = true;
    $("nextBtn").textContent = round === TOTAL_ROUNDS - 1 ? "SEE RESULTS →" : "NEXT QUESTION →";
    document.body.classList.remove("deep-hit");
    renderSegments();
    resumeClock();
    $("answer").focus();
  }

  function begin() {
    if (bank.length < TOTAL_ROUNDS) {
      alert("The question bank is missing. Refresh the page and try again.");
      return;
    }
    runId += 1;
    stopClock();
    clearAutoNext();
    if (sceneHandle !== null) clearTimeout(sceneHandle);
    sceneHandle = null;
    $("gauge").classList.remove("is-drilling");
    $("sceneFeedback").classList.remove("active");
    deck = shuffle(bank).slice(0, TOTAL_ROUNDS);
    round = 0;
    depth = 0;
    deepCuts = 0;
    submitted = false;
    checking = false;
    history = [];
    updateBest();
    renderHistory();
    renderDrill();
    switchScreen(gameScreen);
    renderQuestion();
  }

  function showGrade(match) {
    const tier = TIERS[match.tierIndex];
    submitted = true;
    pauseClock();
    depth += tier.points;
    if (match.tierIndex === 4) deepCuts += 1;
    history.push({
      number: round + 1,
      answer: match.canonical,
      tier
    });
    renderDrill();
    renderHistory();
    animateDig(tier.points);

    $("rarityName").textContent = tier.label;
    $("acceptedName").textContent = "You answered: " + match.canonical;
    $("earnedPoints").textContent = "+" + tier.points + " METERS";
    $("resultBox").className = "graded " + tier.slug;
    $("unknownBox").hidden = true;
    $("resultBox").hidden = false;
    $("answerForm").hidden = true;
    $("skipBtn").disabled = true;
    if (tier.slug === "deep") document.body.classList.add("deep-hit");
    scheduleAdvance(RESULT_MS);
  }

  function timeUp() {
    if (submitted || checking) return;
    submitted = true;
    stopClock();
    remainingMs = 0;
    displayClock();
    history.push({ number: round + 1, answer: "No answer (time up)", tier: null });
    renderHistory();
    $("answerForm").hidden = true;
    $("unknownBox").hidden = true;
    $("rarityName").textContent = "TIME'S UP!";
    $("acceptedName").textContent = "No answer locked in this round.";
    $("earnedPoints").textContent = "+0 METERS";
    $("resultBox").className = "graded timeout";
    $("resultBox").hidden = false;
    $("skipBtn").disabled = true;
    scheduleAdvance(1600);
  }

  async function submitAnswer(event) {
    event.preventDefault();
    if (submitted || checking) return;
    const raw = $("answer").value.trim();
    if (!raw) return;
    // A late input cannot bypass the deadline if the UI interval was throttled.
    if (clockHandle !== null) tick();
    if (submitted) return;
    const category = deck[round];
    if (!category) return;

    const match = indices.get(category.id).get(norm(raw));
    if (match) {
      showGrade(match);
      return;
    }

    const endpoint = String(window.DEEP_CUT_GRADING_URL || "").trim();
    if (!endpoint) {
      $("unknownBox").textContent = "This answer isn't in our offline dictionary yet. AI grading hasn't been connected. Try another answer or skip.";
      $("unknownBox").hidden = false;
      $("answer").focus();
      return;
    }

    const previous = rejected.get(norm(raw));
    if (previous) {
      $("unknownBox").textContent = previous;
      $("unknownBox").hidden = false;
      $("answer").select();
      return;
    }
    checking = true;
    pauseClock();
    $("timerNotice").textContent = "Checking that answer — clock paused.";
    $("unknownBox").hidden = true;
    $("answer").disabled = true;
    $("submitBtn").disabled = true;
    $("skipBtn").disabled = true;
    $("submitBtn").textContent = "CHECKING...";
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: category.id, answer: raw })
      });
      const result = await response.json();
      if (result.status === "accepted" && Number.isInteger(result.tierIndex) &&
          result.tierIndex >= 0 && result.tierIndex < TIERS.length &&
          typeof result.canonical === "string" && result.canonical.trim()) {
        showGrade({ canonical: result.canonical.slice(0, 100), tierIndex: result.tierIndex });
      } else {
        const message = typeof result.message === "string"
          ? result.message
          : "We couldn't verify that answer. Try again.";
        // Store only definitive rejections, never temporary outages or quota failures.
        if (result.status === "invalid" || result.status === "unverified") rejected.set(norm(raw), message);
        $("unknownBox").textContent = message;
        $("unknownBox").hidden = false;
        $("answer").value = "";
      }
    } catch (_) {
      $("unknownBox").textContent = "Couldn't reach the AI judge. Try again or use a known answer.";
      $("unknownBox").hidden = false;
    } finally {
      checking = false;
      $("submitBtn").textContent = "LOCK IN →";
      if (!submitted) {
        $("timerNotice").textContent = "Invalid answer? Keep guessing until one gets through.";
        resumeClock();
        $("answer").disabled = false;
        $("submitBtn").disabled = false;
        $("skipBtn").disabled = false;
        $("answer").focus();
      }
    }
  }

  function skipQuestion() {
    if (submitted || checking) return;
    submitted = true;
    pauseClock();
    history.push({ number: round + 1, answer: deck[round].prompt + " — skipped", tier: null });
    renderHistory();
    advance();
  }

  function advance() {
    if (!submitted) return;
    clearAutoNext();
    stopClock();
    round += 1;
    if (round >= TOTAL_ROUNDS) finishRun();
    else renderQuestion();
  }

  function finishRun() {
    stopClock();
    clearAutoNext();
    const newRecord = depth > best;
    if (newRecord) {
      best = depth;
      writeBest(best);
    }
    updateBest();
    $("endScore").textContent = depth.toLocaleString();
    $("endCuts").textContent = String(deepCuts);
    $("endAnswered").textContent = history.filter((item) => item.tier !== null).length + " / " + TOTAL_ROUNDS;
    $("endSummary").textContent = newRecord
      ? "New personal best! Your obscure knowledge paid off. Think you can dig even deeper?"
      : deepCuts > 0
        ? "You hit " + deepCuts + " DEEP CUT" + (deepCuts === 1 ? "" : "S") + "! Can you top your best run?"
        : "Ten questions done. Next time, try an answer nobody else would think of.";
    switchScreen(endScreen);
    $("againBtn").focus();
  }

  $("startBtn").addEventListener("click", begin);
  $("againBtn").addEventListener("click", begin);
  $("homeBtn").addEventListener("click", () => {
    stopClock();
    clearAutoNext();
    updateBest();
    switchScreen(startScreen);
    $("startBtn").focus();
  });
  $("answerForm").addEventListener("submit", submitAnswer);
  $("skipBtn").addEventListener("click", skipQuestion);
  $("nextBtn").addEventListener("click", advance);

  updateBest();
  renderDrill();
})();
