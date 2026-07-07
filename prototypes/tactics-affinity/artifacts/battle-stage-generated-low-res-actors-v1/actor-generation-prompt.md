# Actor Generation Prompt

Use case: stylized-concept
Asset type: game-ready low-resolution tactical RPG sprite sheet source for the Ruined Crossing tactics prototype.

Create a single clean sprite-atlas image on a perfectly flat solid #ff00ff chroma-key background for background removal. The background must be uniform magenta with no shadows, gradients, texture, floor plane, text, labels, or watermark. Do not use #ff00ff anywhere inside the sprites.

Camera and style: low-resolution tactical RPG sprite art, 3/4 isometric tactics camera angle, native working frame size around 64x64 pixels, pixel-art-inspired chunky silhouettes, crisp dark outline, grouped shadow values, top-left lighting, limited 8-12 color palette per actor, hard-edged readable clusters, no high-resolution painterly rendering, no realistic faces, no tiny facial features, no thin filigree, no soft airbrush texture.

Sheet layout: 6 rows by 4 columns. Each row is one actor role. Each column is one pose in this exact order: idle, attack windup, hit reaction, move lean. Keep each actor centered in its cell with stable foot anchor, stable head height, stable costume, stable proportions, stable camera angle, and stable lighting across all four poses. Make the pose change readable without changing anatomy or costume identity.

Rows:
1. Iron Guard player: compact armored shield fighter, blue steel armor, broad kite shield, short sword, upright protective silhouette, bright shield edge, heroic and readable.
2. Verdant Ranger player: lean hooded archer, green cloak, simple bow, long diagonal weapon silhouette, lower crouched scout stance, readable hood and bow.
3. Radiant Acolyte player: small robed support caster, warm gold robe, pale teal staff, rounded friendly silhouette, simple shoulder mantle, no ornate face detail.
4. Grave Skitter enemy: low spider-like grave creature, bone plates, dark legs, teal eye dots, crouched pouncing threat shape, wide low silhouette.
5. Stone Brute enemy: heavy mossy stone golem, large block arms, hunched crushing pose, dark stone value mass, cyan core mark, silhouette readable in grayscale.
6. Grave Archer enemy: skeletal hooded archer, dark brown cloak, bone bow, narrow angular threat pose, spiky shoulders, clear bow silhouette.

Faction separation: players use brighter blue/green/gold palettes with cleaner upright silhouettes. Enemies use darker stone/bone/cloak palettes, angular or hunched threat shapes, stronger black value masses, and silhouettes that still separate clearly when converted to grayscale.

Animation readiness: the four poses per row must look like frames from the same 3-5 frame animation family: idle, windup/attack, hit reaction, and move/lean. Avoid mirror-only substitutions, wild anatomy drift, different costumes, different camera angles, and different lighting.

Negative prompt: no CSS shapes, no icon blobs, no tokens, no board tiles, no UI labels, no high-res fantasy card illustration, no realistic portrait, no tiny jewelry, no text, no numbers, no background scene, no cast shadow, no contact shadow, no blur, no painterly smears.

