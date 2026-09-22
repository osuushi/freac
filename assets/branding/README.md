# Application icon

`freac-icon-antique-f-v3.png` is the approved master: an engraved F on yellowed
paper with a rounded bezel and transparent surroundings. Earlier versions and
the built-in image generation prompts are retained as design sources.

To regenerate the committed macOS ICNS, Windows ICO and browser/host PNG assets
on macOS, from the repository root:

```sh
source /Users/adacohen/.nvm/nvm.sh && nvm use
node scripts/generate-icons.mjs
```

Generation uses macOS `sips` and `iconutil`; ordinary builds on other systems use
the committed assets and do not require these utilities. Forge uses the platform
icon under `packaging/icons`; Vite copies `assets/public` into the renderer build.
