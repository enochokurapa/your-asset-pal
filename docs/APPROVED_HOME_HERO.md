# Approved AssetFlow 360 homepage hero

**Artwork approved:** original 1774 × 887 PNG showing the seven-step asset lifecycle:
Plan, Acquire, Deploy, Maintain, Track, Optimise, Dispose.

**Do not regenerate, recolor, or redraw the approved PNG.**

## Required asset before merge
Place the supplied file at:

`public/assetflow360-approved-home-hero.png`

The updated `src/routes/index.tsx` references that path. Until the binary is present in this repository, the homepage image will be broken. **Do not deploy the branch without the binary.**

## Implementation choices
- Retain the live `PublicHeader` and remove the picture's duplicated menu visually via CSS crop, without changing the underlying file.
- The bitmap includes a sample seven-step staircase, laptop, mobile app and marketing labels; it is illustrative artwork, **not production usage metrics**.
- Keep real accessible navigation and CTAs.
- Official app brand styling: AssetFlow orange `#C77435` and deep navy `#102B3C`. Keep the image's approved blue colors unchanged.
- Avoid floating illustrations and gratuitous animations.
- Review the tiny baked-in text on mobile before release.

Additional page heroes should be designed and approved individually; do not generate replacements for the homepage hero.
