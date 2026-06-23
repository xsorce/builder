# PageBuilder Local Editor

## 1. What It Is

This repo is the local PageBuilder editor app. You can make pages with text, images, videos, audio, animations, crop, resize, drag, rotate, mobile view, page passwords, and preview pages.

Vercel should not be connected to this builder repo long-term. Publishing happens by exporting or copying page JSON and assets to `PageBuilder-Site`.

## 2. How To Download

Download or clone this PageBuilder builder folder onto your computer.

## 3. How To Install

Open a terminal in the PageBuilder builder folder and run:

```bash
npm install
```

## 4. How To Run Locally

Run:

```bash
npm run dev
```

Then open the local URL shown in your terminal. To edit the starter page, open:

```text
http://localhost:3000/?edit=1
```

## 5. How To Build

Run:

```bash
npm run build
```

Then start the built app:

```bash
npm start
```

## How To Use The Builder

Run the app in development mode and open a page with `?edit=1`.

Use the toolbar to add text, images, video, or audio. 

Select an item to drag, resize, rotate, edit style, change animations, crop images, and switch between desktop and mobile view. 

Use the page panel to create, duplicate, rename, or delete pages.

## 8. How To Replace Default Assets

Put your own files in these folders:

- `public/images`
- `public/videos`
- `public/audio`
- `public/shapes`

Page data lives in:

```text
content/canvas/pages
```

## 9. How To Upload To GitHub

From inside the PageBuilder builder folder, run:

```bash
git init
git add .
git commit -m "Initial standalone web builder export"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```
