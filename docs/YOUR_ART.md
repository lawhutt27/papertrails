# Your own art as paper cards

The game builds its whole world from flat sprite art cut into paper cards: trees are two crossed cards, houses
are folded paper, bushes, rocks and animals are single standees. You can repaint any of them with your own
drawings, from one sprite sheet, with no 3D models and no Blender. The game does the cutting when it loads.

## In three steps

1. **Draw** your sprites on one sheet (any size, PNG). Leave clear space between drawings. A transparent
   background is best; a plain background colour also works (the colour of the top-left pixel is keyed out).
   Draw each thing **from the front, standing on its feet** (a tree from the side, not from above): the bottom of
   each drawing becomes the line where the card stands on the ground.
2. **Number** them: open `art-guide.html` (`npm run dev`, then http://127.0.0.1:5273/art-guide.html). It shows your
   sheet with every drawing numbered 1, 2, 3… in reading order, and every card slot in the game grouped by kind,
   with its shape (width / height).
3. **Map** them in `public/textures/art/mine/art.json`, next to your sheet:

```json
{
  "sheet": "sheet.png",
  "kinds": {
    "tree": [1, 2, 3],
    "pine": [4, 5],
    "bush": [6, 7],
    "rock": [8]
  },
  "slots": { "trees_a_4": 2 },
  "animals": { "fox": 9, "sheep": { "walk_a": 10, "walk_b": 11, "*": 10 } }
}
```

Reload the game. Every slot of a kind takes your drawings in turn (`"tree": [1, 2, 3]` cycles three trees over all
the tree slots); `slots` sets one slot by name and wins over `kinds`. Anything you don't map keeps the original art.

## What the game does with each drawing

- trims it, adds a **cream die-cut rim** round it (like a card cut out with scissors), fits it into the slot with
  its feet on the ground line, and bleeds its colours past the cut so edges stay clean when far away;
- traces its **outline** and **re-cuts the paper cards** to that shape: a real card with a cut edge and thickness,
  lit, shadowed, swaying in the wind, crossed for trees, and blocking the traveller where it stands;
- walls, roofs and gables (kinds marked *fill* in the guide) are stretched to fill their slot instead, because the
  folded house is made of cards that fit each other. Paint them as flat rectangles (the window glow stays where the
  original windows were).

## Options in art.json

| Key | Default | Does |
| --- | --- | --- |
| `sheet` | `sheet.png` | Your sheet, in the same folder |
| `rim` | `3` | Width (px at 256 px slot height) of the cream paper rim; `0` for none |
| `rimColor` | `#f4e6c8` | Colour of the rim |
| `gap` | `6` | Pieces closer than this (px) count as one drawing |
| `background` | none | Force a background colour to key out, e.g. `"#ffffff"` |
| `fill` | `[]` | More kinds or slot names to stretch instead of fit |
| `outlineDetail` | `0.9` | Outline smoothing in px (higher = simpler cut) |

## Trying it

- `?art=example` loads the placeholder example set in `public/textures/art/example/` (simple trees, bushes and a
  rock drawn by `tools/make_example_sheet.py`, only there to show the pipeline).
- `?art=<folder>` loads any other set in `public/textures/art/<folder>/`; `?art=original` ignores your set.
- The browser console says how many drawings it found and how many cards it re-cut.

## Other switches added with the diorama look

- `?popup=1` brings back the original pop-up book behaviour (cards fold up as you walk near them). By default
  everything simply stands (`CONFIG.world.popup`, `standRadius`).
- `?dream=0` turns off the dream pass (soft glow, sun shafts, light leak) to compare (`CONFIG.post.dream`).
