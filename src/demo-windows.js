'use strict';

/**
 * Scripted window sequence for demo / headless mode.
 * Dwell times are long enough that a 30s unproductive threshold fires a reminder.
 */
const SEQUENCE = [
  {
    title: 'main.js — focusflow — Visual Studio Code',
    owner: { name: 'Code', path: '/usr/share/code/code' },
    dwellMs: 8000
  },
  {
    title: 'cursor/focusflow: Pull Request #12 — GitHub',
    owner: { name: 'Google Chrome', path: '/usr/bin/google-chrome' },
    url: 'https://github.com/acme/focusflow/pull/12',
    dwellMs: 7000
  },
  {
    title: 'FocusFlow — Notion',
    owner: { name: 'Notion', path: '/usr/bin/notion' },
    dwellMs: 6000
  },
  {
    title: 'lofi hip hop radio — YouTube',
    owner: { name: 'Google Chrome', path: '/usr/bin/google-chrome' },
    url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    dwellMs: 38000
  },
  {
    title: 'src/tracker.js — focusflow — Cursor',
    owner: { name: 'Cursor', path: '/usr/bin/cursor' },
    dwellMs: 8000
  },
  {
    title: 'Home / X',
    owner: { name: 'Google Chrome', path: '/usr/bin/google-chrome' },
    url: 'https://x.com/home',
    dwellMs: 36000
  },
  {
    title: 'box@cursor: ~/focusflow — Terminal',
    owner: { name: 'gnome-terminal', path: '/usr/bin/gnome-terminal' },
    dwellMs: 7000
  },
  {
    title: 'r/programming — Reddit',
    owner: { name: 'Firefox', path: '/usr/bin/firefox' },
    url: 'https://www.reddit.com/r/programming',
    dwellMs: 36000
  },
  {
    title: 'Product spec — Google Docs',
    owner: { name: 'Google Chrome', path: '/usr/bin/google-chrome' },
    url: 'https://docs.google.com/document/d/abc',
    dwellMs: 8000
  },
  {
    title: 'Stranger Things — Netflix',
    owner: { name: 'Google Chrome', path: '/usr/bin/google-chrome' },
    url: 'https://www.netflix.com/watch/123',
    dwellMs: 36000
  }
];

function createDemoBackend() {
  let index = 0;
  let enteredAt = Date.now();

  function current() {
    const now = Date.now();
    let item = SEQUENCE[index];
    if (now - enteredAt >= item.dwellMs) {
      index = (index + 1) % SEQUENCE.length;
      enteredAt = now;
      item = SEQUENCE[index];
    }
    return {
      title: item.title,
      owner: { name: item.owner.name, path: item.owner.path },
      url: item.url || '',
      bounds: { x: 0, y: 0, width: 1440, height: 900 },
      platform: 'demo'
    };
  }

  function peek() {
    return SEQUENCE[index];
  }

  return { getActiveWindow: current, peek, sequence: SEQUENCE };
}

module.exports = { createDemoBackend, SEQUENCE };
