# Card art brief

For the artist and the owner. The owner chose this brief on 2026-10-19 (DECISIONS D-360). Each card's own subject is a
one-line brief in `packages/content/art-briefs.json`; this page is what every picture has in common.

## Style

- Black ink on white, in the spirit of Junji Ito's dark fantasy. No colour and no grey wash. Hatching and stippling
  are fine.
- Each picture must read as one strong silhouette at 76×95 pixels, about the size of a thumbnail, because that is a
  board card on a small phone.

## Shape and size

- 4:5 portrait, the card's own shape. The art fills the whole card, so nothing is cropped on the board, and Inspect
  shows the whole picture at about 320×400.
- 1600×2000 pixels or larger.

## Quiet areas

The name, icons and stats are lettered straight onto the art in black with a white outline. They read on solid
black, solid white and open texture, but not on fine grey hatching. Keep these areas plain, solid or very open.

| Area | Where, as a share of the card | What sits there |
| --- | --- | --- |
| Name | the top 16%, full width | the card's name |
| Turn marks | the left edge, from 19% to 57% down, 18% wide | small icons such as "already attacked" |
| Element and keywords | the right edge, from 19% to 32% down, 30% wide | the element badge and one or two keyword icons |
| Power and Guard | the bottom 16%, the right 58% | the two numbers |
| Focus | a circle in the middle, about half the card wide | the face or the main shape |

## Files

- Deliver one PNG (or lossless WebP) per card, named by the card's id, for example `veil-shade.png`. The ids are
  the keys of `packages/content/art-briefs.json`.
- The game loads `apps/web/public/art/<card-id>.webp`. Convert each PNG to WebP and drop it into that folder. No
  code changes are needed: a card without a file keeps its placeholder silhouette.
