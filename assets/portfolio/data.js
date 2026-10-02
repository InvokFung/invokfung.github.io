/*
 * Everything the portfolio shows lives in this file.
 * The page renders the output AND writes its own "source code" from this data,
 * so adding an entry here updates both sides of the screen.
 *
 *   New project  → push an object onto `projects` (newest first is fine, order is kept).
 *   New role/job → push an entry onto `history` with branch: "work".
 *   Blog numbers → update `writing` (snapshot of /blog at the time of editing).
 */
window.PORTFOLIO = {
  profile: {
    name: "Alan Fung",
    handle: "InvokFung",
    role: "Software Engineer",
    tagline: "Dedicated to programming. Obsessed with charm, visual effects and the feel of a good interface.",
    email: "aflung10@gmail.com",
    github: "https://github.com/InvokFung",
    firstCommit: 2018,
    loves: ["programming", "visual effects", "user experience"],
    about: [
      "I'm a developer obsessed with charm, stunning visual effects and user experience.",
      "Not limited to programming: I go down into networking, infrastructure and engineering too, and I write everything I learn into a public study log.",
      "Off the keyboard I play the violin, and I'm teaching myself the piano."
    ]
  },

  // Rendered as a TypeScript interface. `notes` = posts on the blog about it (evidence, not vibes).
  stack: [
    { group: "languages", items: [["TypeScript"], ["JavaScript"], ["Python"], ["Java"], ["C++"]] },
    { group: "web", items: [["Next.js"], ["React"], ["Node.js"], ["Three.js"], ["HTML5 media"]] },
    { group: "data", items: [["MongoDB", 35], ["PostgreSQL", 13], ["Databases", 43]] },
    { group: "infra", items: [["AWS", 14], ["Docker", 13], ["Kubernetes", 9], ["Terraform"], ["Networking", 6]] },
    { group: "craft", items: [["3D / CAD", 19], ["Circuits", 6], ["Maths", 24], ["Music", 19]] }
  ],

  /*
   * status: "live" (has a URL you can run) | "source" (code on GitHub) | "wip"
   * featured: true gives the card double width.
   */
  projects: [
    {
      id: "atlas",
      name: "StudyLog Atlas",
      year: 2026,
      kind: "Search + 3D visualisation",
      status: "live",
      featured: true,
      summary: "Every StudyLog post as a 3D galaxy of 5,551 passages placed by meaning. Ask a question and the matching stars light up, with the exact section linked. All computed at build time: no model, API key or server.",
      highlights: ["Hybrid keyword + semantic search (85% hit@1 on a 60-question eval)", "TF-IDF → hand-written randomized SVD → UMAP layout", "One-draw-call point cloud with a custom GLSL shader"],
      stack: ["TypeScript", "React Three Fiber", "GLSL", "BM25", "UMAP"],
      links: { live: "/atlas/" }
    },
    {
      id: "studylog",
      name: "StudyLog",
      year: 2022,
      kind: "Knowledge base",
      status: "live",
      featured: true,
      summary: "A public engineering notebook: 170+ long-form notes on databases, cloud, Kubernetes, maths, 3D printing and music, with diagrams, KaTeX and full-text search.",
      highlights: ["174 posts and counting", "Custom build pipeline + static export", "Local full-text search"],
      stack: ["Next.js", "Markdown", "KaTeX", "Python"],
      links: { live: "/blog/" }
    },
    {
      id: "chilltimer",
      name: "ChillTimer",
      year: 2023,
      kind: "Focus tool",
      status: "live",
      summary: "An immersive Pomodoro timer with lofi music, ambient soundscapes, video scenes and weekly focus statistics. No sign-up, everything stays in the browser.",
      highlights: ["Music + ambient mixer", "Scene backgrounds", "Weekly / all-time stats"],
      stack: ["Vanilla JS", "CSS", "HTML5 media", "localStorage"],
      links: { live: "/ptimer/" }
    },
    {
      id: "triplefind",
      name: "TripleFind",
      year: 2023,
      kind: "Game",
      status: "live",
      summary: "A memory game about finding triples against the clock. The faster you find one, the more it's worth, and re-flipping a card you've seen costs you.",
      highlights: ["Adaptive card count per screen size", "Time-proportional scoring", "Scene transitions + result analysis"],
      stack: ["JavaScript", "DOM", "CSS"],
      links: { live: "/triplefind/" }
    },
    {
      id: "reconstruction",
      name: "3D Reconstruction",
      year: 2024,
      kind: "Final year project",
      status: "source",
      featured: true,
      summary: "My final year project: a full system for turning images into 3D models, split into a web client, a Node API and a Python processing backend.",
      highlights: ["Three-tier architecture", "Python reconstruction backend", "Web viewer + REST API"],
      stack: ["JavaScript", "Node.js", "Python", "Three.js"],
      links: { source: "https://github.com/InvokFung/3dreconstruction" }
    },
    {
      id: "shapecalc",
      name: "Shape Calculator",
      year: 2023,
      kind: "Utility",
      status: "source",
      summary: "Compute properties of shapes straight from their coordinates.",
      highlights: ["Coordinate geometry"],
      stack: ["JavaScript"],
      links: { source: "https://github.com/InvokFung/ShapeCalculator" }
    },
    {
      id: "genius",
      name: "genius",
      year: 2021,
      kind: "Experiment",
      status: "source",
      summary: "A playful little web experiment from the early days.",
      highlights: ["Fun web"],
      stack: ["HTML", "CSS", "JS"],
      links: { source: "https://github.com/InvokFung/genius" }
    }
  ],

  /*
   * Rendered as `git log --graph`. Newest first.
   * branch: "main" (code shipped) | "study" (learning) | "play" (games, music, fun) | "work" (roles)
   */
  history: [
    { date: "2026-10", branch: "main", title: "Rebuild invokfung.github.io as a live, editable program", tag: "HEAD" },
    { date: "2026-10", branch: "main", title: "Ship StudyLog Atlas: a 3D, searchable map of every note" },
    { date: "2026-09", branch: "study", title: "Finish the 24-part Dev Essentials series" },
    { date: "2026-09", branch: "study", title: "Next.js Deep Dive: production builds" },
    { date: "2026-08", branch: "study", title: "3D Printing course: strength, failure modes, functional parts" },
    { date: "2025-12", branch: "study", title: "86 notes in one year: MongoDB, PostgreSQL, AWS, Kubernetes" },
    { date: "2024-11", branch: "study", title: "Relaunch StudyLog with a new build pipeline" },
    { date: "2024-02", branch: "main", title: "Ship 3D Reconstruction, my final year project" },
    { date: "2023-06", branch: "main", title: "Shape Calculator" },
    { date: "2023-03", branch: "play", title: "First version of ChillTimer" },
    { date: "2023-02", branch: "play", title: "TripleFind goes live" },
    { date: "2022-05", branch: "study", title: "First StudyLog notes: DSA in C++, Java, networking, logic circuits" },
    { date: "2022-05", branch: "main", title: "git init invokfung.github.io" },
    { date: "2021-07", branch: "play", title: "genius, a fun web experiment" },
    { date: "2020-09", branch: "main", title: "Experiments with serverless databases (FaunaDB)" },
    { date: "2018-11", branch: "main", title: "First repo: a Java group project", tag: "root" }
  ],

  // Snapshot of /blog (174 posts as of 2026-10-02).
  writing: {
    total: 174,
    since: 2022,
    byYear: [["2022", 10], ["2024", 10], ["2025", 86], ["2026", 68]],
    topics: [["Programming", 56], ["Database", 43], ["MongoDB", 35], ["Dev Essentials", 24], ["Mathematics", 24], ["Web", 23], ["3D", 19], ["Music", 19]],
    latest: [
      { date: "2026-09-25", title: "Desk Health: Eye Strain, Posture, Movement and Setup", url: "/blog/2026/09/25/dev_24_desk_health/" },
      { date: "2026-09-20", title: "Design Docs and READMEs People Actually Read", url: "/blog/2026/09/20/dev_22_design_docs_readmes/" },
      { date: "2026-09-18", title: "Estimating Software Tasks: Breakdown, Ranges and Why Estimates Slip", url: "/blog/2026/09/18/dev_21_estimating/" },
      { date: "2026-09-07", title: "RAG from Scratch in Python", url: "/blog/2026/09/07/dev_19_rag_from_scratch/" },
      { date: "2026-09-01", title: "Next.js Deep Dive: Production Next.js", url: "/blog/2026/09/01/nextjs_03_production/" }
    ]
  }
};
