# invokfung.github.io

Alan Fung's portfolio, served from GitHub Pages.

The landing page is drawn as the control flow of a program. One thread runs from `main()` to
`hire()` and lights up as you scroll:

1. **main()**: the name, typed out and "decompiled".
2. **whoami()**: a one-line statement whose highlighted phrases open the evidence behind them.
3. **history()**: a `for (const year of alan.life)` loop. The section pins and scrolls sideways
   through the years, with a rail, live counters and `HEAD → <year>` in the nav. ← → also work.
4. **fork(projects)**: the thread forks into four flagship cards, then the smaller experiments.
   Each card opens a case study (`#work/<id>` links straight to one).
5. **hire()**: run the line to resolve the promise.

Extras: `</> source` opens the page's own generated source next to it (the dotted values are live:
theme, accent, motion, name, coffee), and <kbd>`</kbd> opens a terminal (`help`, `checkout 2023`,
`show atlas`, `git log`, `theme paper`…).

- `index.html`: page shell
- `assets/portfolio/data.js`: **all content** (profile, statement, stack, eras, projects, blog stats)
- `assets/portfolio/app.js`: renderer, thread engine, history loop, case studies, source view, terminal
- `assets/portfolio/style.css`: themes and layout

To add a project, push an object onto `projects` in `data.js` (`tier: "flagship"` or
`"experiment"`, `status: "live" | "source" | "wip"`, optional `motif` for its generated cover).
The card, its case study and its line of source are all generated from that entry. To add a
chapter, push onto `eras` and list the project ids it shipped. Blog numbers in `writing` are a
snapshot and need a manual refresh.

Other corners: `/blog/` (StudyLog), `/atlas/` (StudyLog Atlas), `/ptimer/` (ChillTimer),
`/triplefind/` (TripleFind).
