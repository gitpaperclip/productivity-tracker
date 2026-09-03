# FocusFlow

Desktop productivity tracker. Tracks the active window, classifies it, shows a dashboard, and reminds you after unproductive streaks.

## Run

1. Open this folder
2. Install packages
3. Start the app

Headless Linux: the launcher starts a virtual framebuffer, enables demo mode, and uses a 30-second reminder threshold.

Environment:

- FOCUSFLOW_DEMO=1 enables the window simulator
- FOCUSFLOW_THRESHOLD_SEC=30 sets a short reminder for demos

## Features

- Real window backend plus a scripted demo backend
- Editable rules in src/rules.json
- Daily totals in ./data (unpackaged) or Electron userData (packaged)
- In-app banner plus desktop notification, with cooldown

## Layout

src/main.js, src/preload.js, src/tracker.js, src/classifier.js, src/store.js, src/demo-windows.js, renderer/
