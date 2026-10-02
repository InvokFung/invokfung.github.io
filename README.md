# invokfung.github.io

Alan Fung's portfolio, served from GitHub Pages.

The landing page is a program: the left pane is its "source", the right pane is its output.
Scrolling steps an execution pointer through the source, the dotted values in the source are
live (theme, accent, motion, name, coffee) and recompile the page, and <kbd>`</kbd> opens a terminal.

- `index.html` — page shell
- `assets/portfolio/data.js` — **all content** (profile, stack, projects, history, blog stats)
- `assets/portfolio/app.js` — renderer, source generator, scroll engine, terminal
- `assets/portfolio/style.css` — themes and layout

To add a project, push an object onto `projects` in `data.js`. The card and its line of source
code are both generated from that entry. Roles and milestones go in `history` (`branch: "work"`
adds a fourth lane to the git graph).

Other corners: `/blog/` (StudyLog), `/ptimer/` (ChillTimer), `/triplefind/` (TripleFind).
