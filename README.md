# DEEP CUT

**How deep does your knowledge go?**

DEEP CUT is a free, single-player browser game where you answer category prompts with the most obscure valid answer you can think of. Every question has a **30-second countdown**. Try as many invalid guesses as you can in that time; the first accepted answer locks in a score and makes your drill go deeper. The timer pauses during AI validation to avoid penalizing server latency. Accepted answers animate the drill and automatically advance after a brief result reveal. Timed-out questions earn zero.

| Tier | Points |
| --- | ---: |
| Common | +10 m |
| Uncommon | +20 m |
| Rare | +50 m |
| Epic | +100 m |
| **DEEP CUT!** | **+200 m** |

The basic version works without signing in. Best depth is saved locally on your device; the optional AI judge uses a server-side backend. There is no multiplayer.

## Playing locally

Open `index.html` in a browser once the game files are installed. You can also publish this repository using **GitHub Pages**. The deployment workflow lives under `.github/workflows/pages.yml`.

### Drill presentation and verification

The underground background fills the viewport behind a centered trivia window. A transparent drill sits directly below the question with no enclosing panel or shaft. A single animation timeline scrolls the entire ground upward and updates all depth counters together. Awards scale the distance and duration; +200 m gets a longer descent, stronger dip, turning auger, and dust burst. Animations stop when idle or the tab is hidden. Reduced-motion mode updates depth immediately without vibration, dust, or scrolling. The dig log can be expanded below the drill.

The Pages workflow stamps the deployed Git commit into `revision.js`. The top bar links that short ID to its GitHub commit; local previews show `COMMIT dev`.

Generated artwork, saved assets, and exact generation prompts are documented in [assets/README.md](assets/README.md). The site remains plain HTML, CSS, and JavaScript; Playwright is a development-only test dependency.

To run browser regressions with Node.js 20 or newer:

```sh
npm ci
npx playwright install chromium
npm test
```

Alternatively set `BROWSER_CHANNEL=chrome` to test an installed Chrome browser. Tests cover all five award tiers, synchronized counters and terrain, retries, mocked AI acceptance/rejection and timer pause, timeout, rapid advancement, 2,000 m completion, replay, mobile widths, reduced motion, and the commit label. Screenshots are saved in ignored `test-output/`. AI responses are mocked so tests do not call the live judge or need secrets.

### Enable the public play link

1. Open **Repository Settings → Pages** in GitHub.
2. Under **Build and deployment**, select **GitHub Actions** as the Source.
3. Open the **Actions** tab and run **Publish DEEP CUT to GitHub Pages** manually if it did not deploy automatically.
4. The intended play URL is `https://focustap.github.io/DEEP-CUT/`.

Until Pages is enabled and a deployment succeeds, the URL may not work. The BenGames launcher already has the game registered as **unpublished** to avoid a broken Play link during development.

## Answer grading

Version 0.1 uses a hand-curated, offline starter answer bank. Rarity tiers are editorial approximations, not observed player frequencies. The bank is deliberately limited: a missing legitimate answer should be reported as **not in the dictionary** rather than claimed to be false. Expand `categories.js` before a wider release.

The upcoming multiplayer/party concept will be a **separate game**, not a feature of this single-player edition.

## Connect GPT-5.6 Luna grading (v0.2 beta)

The **OpenAI secret key must never be added to GitHub, `ai-config.js`, or the player's browser.** The server runs on a Supabase Edge Function. The single-player frontend continues to work offline until the function is configured.

1. In your **Supabase project dashboard**, open **Edge Functions → Secrets**. Create a secret named **`OPENAI_API_KEY`**, and paste the project-specific key from your **OpenAI DeepCut API project** as its value. You may also create **`IP_HASH_SALT`** with an unrelated random secret string. Never share those values.
2. Open **Supabase SQL Editor** and run all of [`supabase/setup-grading.sql`](supabase/setup-grading.sql). This creates the backend-only cache and durable per-IP / global request quotas. It is required; grading fails closed if quota tables aren't configured.
3. Open **Edge Functions → Deploy a new function → Via Editor**, name it **`grade-answer`**, and paste [`supabase/functions/grade-answer/index.ts`](supabase/functions/grade-answer/index.ts). Deploy the function. Turn **off JWT verification** for this public function (configured in [`supabase/config.toml`](supabase/config.toml) if deploying through the CLI). It does *not* rely on JWT authorization because the game does not require a player account; the function limits requests itself.
4. The function URL is `https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/grade-answer`. Edit [`ai-config.js`](ai-config.js) and set **`window.DEEP_CUT_GRADING_URL`** to that public URL. This is **not a secret** and can be committed safely.
5. Test with a previously unknown real answer. The browser will send `{ "categoryId": "video-games", "answer": "Your obscure game" }` to the Edge Function. The function uses `gpt-5.6-luna`, evaluates correctness and rarity, and returns `{ "status": "accepted", "canonical": "...", "tierIndex": 4, "source": "ai" }` when confident. Unknown or uncertain answers don't cost the player points.

### Safety and limits

- **120 uncached OpenAI grading calls globally per UTC day**, **30 per caller per day**, and **6 per caller per minute** (best effort per-IP; global cap always applies). Edit the limits in SQL if you need to. Cache hits do not consume OpenAI calls.
- Database tables have RLS enabled, and client roles cannot read/write cache or quota tables or call the quota function. Only the Edge Function uses backend credentials. No user credentials or API keys are shipped in the browser.
- The grading endpoint is publicly callable from the game and local previews using permissive browser CORS. **CORS is not authentication**; the database-backed global and per-caller limits prevent unlimited OpenAI usage. Browser requests use a simple `text/plain` content type with a JSON body to avoid an unnecessary OPTIONS preflight.
- AI judgments are estimates, **not factual guarantees**. Only higher-confidence valid answers score, and only very high-confidence answers are cached. Revisit rarity calibration and add a reporting mechanism before release.
- This daily API request cap is **not a dollar-spend limit**. Set your own OpenAI API project budget/alerts and review the real billing rules. The shared OpenAI complimentary-token allowance also covers other eligible API projects in the same organization.
- If Supabase returns 404 or the frontend reports "AI grading hasn't been connected," confirm the function was deployed and `ai-config.js` was updated. If it returns 503, check secrets, SQL setup, function logs, and the OpenAI API key's project permissions.

**No secret needs to be pasted into ChatGPT.** If you share the *public Supabase function URL only*, the frontend configuration can be completed without exposing the API key.
