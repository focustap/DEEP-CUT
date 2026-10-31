# DEEP CUT artwork

Generated with the built-in ImageGen tool, then resized and encoded as WebP for the game. The drill is an RGBA PNG with real transparent pixels around the machine. The current files together are about 107 KB. No image-generation service is called during gameplay.

- `assets/drill-cutout.png`: 256 × 384, transparent drill sprite; shared by the home screen and game. Replaces the first revision of the sprite.
- `assets/ground.webp`: 512 × 512, dark rock texture. CSS mirrors alternating vertical bands to avoid seams as the full-screen ground scrolls. The terrain adds enough bands for the current viewport height.

## Final drill prompt

Use case: stylized-concept. Asset type: transparent game sprite for DEEP CUT, a dark navy/teal/cyan trivia drilling arcade game. Create ONE small vertical underground drilling machine, facing straight down, front orthographic elevation, centered fully visible with tight framing and some transparent padding. Rounded compact teal metal body, dark navy cockpit with a tiny cyan light, two short stabilizer fins, silver spiral cone drill tip at bottom. Style: polished pixel-inspired 2D arcade sprite, fine pixel detail and crisp stepped edges, elegant 16-bit shading, cohesive broad shapes, tasteful teal gradients rendered as tidy color clusters, subtle lighting, readable at 64 pixels wide. User wants Krillion-like pixel art feel, avoid coarse chunky Minecraft blocks or low-effort sprite art. No perspective, no background, no ground, no text, no glow halo, no smoke, no extra objects. Real transparent alpha background.

## Final background prompt

Use case: stylized-concept. Asset type: vertically seamless repeating underground texture tile for a small arcade game background. Generate a square, quiet dark navy and blue slate rock cross-section. Polished fine pixel-inspired 2D arcade art, crisp stepped edges and tasteful clustered shading, muted dark blue/teal palette. Broad low-contrast horizontal layered sediment seams, just a handful of tiny slate pebbles, subtle texture. Flat orthographic view. Seamlessly tileable especially top to bottom; uniform lighting and detail distribution across edges, no vignette or framing. Dark overall #111f30 to #203345, very low contrast to keep trivia UI and small teal drill in focus. No drill, no central shaft, no focal objects, no crystals, no biomes, no glowing ore, no text, no particles, no icons. Full opaque texture edge to edge.

## Final cutout edit prompt

Edit target: the attached DEEP CUT drill sprite. Preserve the exact teal/navy/silver pixel-inspired drilling machine and its downward orientation. Remove ALL background, dark matte, haze, glow halo, floor shadow, vignette, and any translucent colored pixels outside the physical metal silhouette. Return a tightly framed isolated drill with genuine transparent alpha everywhere outside the machine, including between fins. Crisp clean cutout edge, solid opaque metal body, no rectangular backdrop or colored canvas. No new objects, no text. This will be composited directly over a textured ground background.

Verified in-browser by sampling transparent pixels on a canvas and rendering the sprite against white, pink, and teal backgrounds. The rig's DOM elements have no background fill. The tip is clipped into a separate CSS layer for the turning animation; it uses the same PNG without another download.
