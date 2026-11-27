---
name: verify
description: Use when a change alters what the product does, before calling it done and before each commit that changes behavior: starts this repo's app or game from a clean checkout and drives it the way a person would.
---

# Verify

<the product in one line>

## Start it

From a clean checkout in a cloud container, in order. First pick the Node version (or other runtime) that `engines` in `package.json` asks for. Then install, build, and start every stand-in for an outside service (a database, payments, mail, sign-in), never the real one.

<start commands>

It is ready when <ready signal>. Last clean start, timed with `date` before and after: <start time>, on commit <commit>.

## Drive it

Open it in a real browser: the Chromium and Playwright the container already has (`require('playwright')`, then `chromium.launch()`), at the sizes the change affects (see "Shoot what the change touches" in `visual-check`). Tap, click, type and press keys the way a person would, and find things by their label or role. Take a screenshot at deviceScaleFactor 1 for your own check, and save it in the scratchpad, never in the repo. The main screen, what it shows and how to use it:

<main screen>

## The journeys

One line each, from a person's side: where it starts, the steps, and what they see at the end.

<journeys>

## Stop it

Stop every server it started and clear what it wrote, so the next run starts clean.

<stop commands>

## When it breaks

A step that breaks or flakes is fixed in this skill first. Each known way a start or a step fails, what it looks like, and the fix:

<known failures>
