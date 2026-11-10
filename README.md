# Tamera Taylor-Moore — Portfolio

This is the source for my portfolio website: case studies of my analytics, sports analytics and strategy projects.

**Live site:** https://searjam17.github.io/
**This repository:** https://github.com/SearJam17/SearJam17.github.io

The site is plain HTML, CSS and a little JavaScript. There's no framework, build step or backend, and no analytics or tracking.

---

## What's in here

```
index.html                      Homepage: intro, projects, about, skills, contact
projects/                       One HTML page per project case study
  _template.html                Copy this to add a new project
assets/css/style.css            All styling (colors and fonts are at the top)
assets/js/main.js               Mobile menu and project filters
assets/images/                  Thumbnails, slide images, favicon, social preview
assets/documents/               Resume and project decks (PDF)
404.html                        "Page not found" page
.nojekyll                       Tells GitHub Pages to serve files as-is
```

Every file in this repository is public, including files that aren't linked from the site. Don't add raw datasets, private feedback, student IDs, or anything else you wouldn't want an employer to see.

## Preview it on your computer

1. Download or clone the repository.
2. Open a terminal in the folder and run `python3 -m http.server 8000`.
3. Visit http://localhost:8000 in your browser.

You can also double-click `index.html`, and most things will work.

## Common updates

### Edit your introduction
Open `index.html` and find the section marked `class="hero"`. The headline is the `<h1>`, and the paragraph under it is `class="hero-lede"`. The "At a glance" box is just below. The About text is in `<section ... id="about">`.

### Add a project
1. Copy `projects/_template.html` to a new file, for example `projects/my-new-project.html`. Use lowercase words joined by hyphens.
2. Fill in every part marked `REPLACE`. Delete any section you don't need. Keep only links that really exist.
3. Put images in a new folder, e.g. `assets/images/my-new-project/`. Use JPGs about 1200 px wide for slides and 800 × 450 for the card thumbnail.
4. Put any public PDF in `assets/documents/`.
5. On the homepage, copy one `<li data-categories="...">` card inside `<ul class="project-grid">` and update its link, image, title, question, tools and context line. `data-categories` controls the filter buttons: use `sports`, `data` and/or `strategy`, separated by spaces.

### Replace an image
Save the new image with the **same file name** in the same folder, and it will appear everywhere that image is used. If the shape changes, update the `width` and `height` numbers on the `<img>` tag so the page doesn't jump while loading. Always update the `alt` text to describe the new image.

### Update your resume
Replace `assets/documents/Tamera-Taylor-Moore-Resume.pdf` with your new PDF, keeping the same file name. Check that it doesn't include your phone number or anything else you don't want public.

### Change the colors
Open `assets/css/style.css`. The first block (`:root`) holds every color. Change `--color-accent` (teal) and `--color-accent-dark` together, and keep them dark enough for white text on buttons.

## How deployment works

The site is a GitHub Pages **user site**. Because the repository is named `SearJam17.github.io`, GitHub publishes it at `https://searjam17.github.io/`.

- Settings → Pages → *Build and deployment* → Source: **Deploy from a branch**, Branch: **main**, folder **/ (root)**.
- Every time you commit to `main`, GitHub republishes the site, usually within a minute or two. You can watch progress in the repository's **Actions** tab.
- The repository must stay **Public**. Settings → General → *Danger Zone* shows the current visibility.

## Recheck public access after every update

Your repository being public and your website working are separate things, so check both.

1. Open a **private/incognito window** (you're signed out of GitHub there).
2. Visit https://searjam17.github.io/. The homepage should load with styles and images.
3. Click every project card, then use "All projects" to come back.
4. Open the Resume link and at least one project PDF.
5. Visit https://github.com/SearJam17/SearJam17.github.io. It should open without asking you to sign in.
6. On your phone (off Wi-Fi if you can), open the site and try the Menu button.
7. Every so often, ask a friend to open the link from your LinkedIn profile without signing in.
