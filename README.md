# DEEP CUT

**How deep does your knowledge go?**

DEEP CUT is a free, single-player browser game where you answer category prompts with the most obscure valid answer you can think of. Your drill goes deeper with every answer.

| Tier | Points |
| --- | ---: |
| Common | +10 m |
| Uncommon | +20 m |
| Rare | +50 m |
| Epic | +100 m |
| **DEEP CUT!** | **+200 m** |

No account, backend, or multiplayer required. Best depth is saved locally on your device.

## Playing locally

Open `index.html` in a browser once the game files are installed. You can also publish this repository using **GitHub Pages**. The deployment workflow lives under `.github/workflows/pages.yml`.

### Enable the public play link

1. Open **Repository Settings → Pages** in GitHub.
2. Under **Build and deployment**, select **GitHub Actions** as the Source.
3. Open the **Actions** tab and run **Publish DEEP CUT to GitHub Pages** manually if it did not deploy automatically.
4. The intended play URL is `https://focustap.github.io/DEEP-CUT/`.

Until Pages is enabled and a deployment succeeds, the URL may not work. The BenGames launcher already has the game registered as **unpublished** to avoid a broken Play link during development.

## Answer grading

Version 0.1 uses a hand-curated, offline starter answer bank. Rarity tiers are editorial approximations, not observed player frequencies. The bank is deliberately limited: a missing legitimate answer should be reported as **not in the dictionary** rather than claimed to be false. Expand `categories.js` before a wider release.

The upcoming multiplayer/party concept will be a **separate game**, not a feature of this single-player edition.
