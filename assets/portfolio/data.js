/*
 * Everything the portfolio shows lives in this file.
 * The page renders its output AND writes its own "source code" from this data,
 * so editing an entry here updates both.
 *
 *   New project   → add an object to `projects` (tier "flagship" or "experiment").
 *   New chapter   → add an object to `eras` (shown in the history loop, oldest first).
 *   Blog numbers  → update `writing` (a snapshot of /blog at the time of editing).
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
    about: [
      "I'm a developer obsessed with charm, stunning visual effects and user experience.",
      "I don't stop at the interface: I go down into databases, networking, infrastructure and the maths underneath, and I write everything I learn into a public study log."
    ]
  },

  // The whoami() statement. Each {token} is interactive and shows the evidence behind it.
  statement: "I'm Alan. I {write everything down}, {go to first principles}, {ship small things often} and {build with my hands}. Off the keyboard, I {play the violin}.",
  traits: [
    { k: "write everything down", n: "174", unit: "notes", text: "Every course, deep dive and side quest becomes a long-form post on StudyLog. Ten in 2022, 86 in 2025 alone.", link: "/blog/" },
    { k: "go to first principles", n: "24", unit: "maths notes", text: "Linear algebra, abstract algebra and real analysis, because the abstractions under graphics, search and ML are worth knowing properly." },
    { k: "ship small things often", n: "7", unit: "shipped", text: "From a Java group project in 2018 to a memory game, a focus timer, a final-year 3D reconstruction system and a semantic search engine." },
    { k: "build with my hands", n: "19", unit: "hardware notes", text: "An 8-part 3D printing course (slicing, G-code, functional parts) and logic circuit design. Layerline, my browser slicer, grows out of this." },
    { k: "play the violin", n: "19", unit: "music notes", text: "Violin notes, and I'm teaching myself the piano. Intonation Studio, a practice room that listens to you play, grows out of this." }
  ],

  // Shown as `import { ... } from "experience"`. since = first year with evidence (a repo or a post).
  stack: [
    ["TypeScript", 2025], ["JavaScript", 2020], ["Python", 2024], ["C++", 2022], ["Java", 2018],
    ["React", 2026], ["Next.js", 2025], ["Vue", 2026], ["Node.js", 2024], ["Three.js", 2025], ["GLSL", 2025],
    ["MongoDB", 2025], ["PostgreSQL", 2025], ["Docker", 2025], ["Kubernetes", 2026], ["AWS", 2025], ["Terraform", 2026],
    ["Networking", 2022], ["Linear algebra", 2025], ["3D printing", 2026]
  ],

  /*
   * The history loop, oldest first. `notes` = StudyLog posts published by the end of that year.
   * `events` also feed `git log` in the terminal.
   */
  eras: [
    {
      id: "2018", label: "2018", title: "First commit", role: "Student",
      text: "A Java group project became my first repository on GitHub. Everything since has been one long commit history.",
      picked: ["Java", "Git"], notes: 0,
      events: [["2018-11", "First repo: a Java group project"]]
    },
    {
      id: "2020", label: "2020", title: "Tinkering", role: "Tinkerer",
      text: "Side experiments to see how things work: serverless databases with FaunaDB, a chess board, and small playful web pages.",
      picked: ["JavaScript", "Serverless DBs", "HTML/CSS"], notes: 0, projects: ["genius"],
      events: [["2020-09", "Experiments with serverless databases (FaunaDB)"], ["2020-11", "A chess board"], ["2021-07", "genius, a fun web experiment"]]
    },
    {
      id: "2022", label: "2022", title: "Learning in public", role: "Computer science student",
      text: "I started StudyLog and this site, publishing my course notes: data structures in C++, Java, networking, logic circuits and statistics.",
      picked: ["C++", "Networking", "Logic circuits"], notes: 10, projects: ["studylog"],
      events: [["2022-05", "git init invokfung.github.io"], ["2022-05", "First StudyLog notes: DSA in C++, Java, networking, circuits"]]
    },
    {
      id: "2023", label: "2023", title: "Shipping small things", role: "Builder",
      text: "I started turning ideas into things people can click: a memory game with time-proportional scoring, a focus timer, and a coordinate-geometry calculator.",
      picked: ["DOM", "Game logic", "Responsive UI"], notes: 10, projects: ["triplefind", "chilltimer", "shapecalc"],
      events: [["2023-02", "TripleFind goes live"], ["2023-03", "First version of ChillTimer"], ["2023-06", "Shape Calculator"]]
    },
    {
      id: "2024", label: "2024", title: "Final year", role: "Final-year student",
      text: "My final year project was a three-tier 3D reconstruction system: a web client, a Node API and a Python backend. In November I relaunched StudyLog, starting with violin and Python notes.",
      picked: ["Python", "Node.js", "REST APIs"], notes: 20, projects: ["reconstruction"],
      events: [["2024-02", "Ship 3D Reconstruction, my final year project"], ["2024-09", "Browser automation with Puppeteer"], ["2024-11", "Relaunch StudyLog: violin and Python notes"]]
    },
    {
      id: "2025", label: "2025", title: "Going deep", role: "Software engineer",
      text: "86 notes in one year: a 30-part MongoDB course, 14 parts of Three.js, C++, PostgreSQL, linear and abstract algebra, and the start of containers and AWS.",
      picked: ["TypeScript", "MongoDB", "Three.js", "PostgreSQL", "Docker"], notes: 106,
      events: [["2025-03", "Start a 30-part MongoDB course"], ["2025-06", "Three.js course: shaders, instancing, R3F, physics"], ["2025-09", "PostgreSQL course"], ["2025-11", "Containers and abstract algebra"]]
    },
    {
      id: "2026", label: "2026", title: "Building in the open", role: "Software engineer",
      text: "AWS and Kubernetes, React, Vue and Next.js deep dives, real analysis, a 3D printing course and a 24-part Dev Essentials series. Then StudyLog Atlas, and this site.",
      picked: ["Kubernetes", "Terraform", "React", "Vue", "Next.js"], notes: 174, projects: ["atlas"],
      events: [["2026-01", "Kubernetes and a JavaScript deep dive"], ["2026-04", "3D printing course; Dev Essentials begins"], ["2026-09", "Dev Essentials: 24 of 24"], ["2026-10", "Ship StudyLog Atlas"], ["2026-10", "Rebuild this site as a program"]]
    },
    {
      id: "next", label: "next", title: "What's next", role: "Building flagships",
      text: "Three flagship builds are under way: a practice room that hears my violin, my card game as real-time multiplayer on Kubernetes, and a 3D-printing slicer in C++ compiled to WebAssembly.",
      picked: ["Web Audio", "WebSockets", "WebAssembly"], notes: 174, projects: ["intonation", "arena", "layerline"],
      events: [["soon", "Intonation Studio: tuner prototype"], ["soon", "TripleFind Arena: multiplayer rooms"], ["soon", "Layerline: C++ slicing core"]]
    }
  ],

  /*
   * tier: "flagship" (big cards, case study) | "experiment" (smaller cards)
   * status: "live" | "source" | "wip"
   * motif: the generated cover: "passages" | "pitch" | "cards" | "layers" | "rings" | "mesh" | "geo" | "dots" (default)
   * why / how / milestones are optional and fill the case study.
   */
  projects: [
    {
      id: "atlas", tier: "flagship", motif: "passages", name: "StudyLog Atlas", year: 2026, kind: "Search engine + 3D", status: "live",
      pitch: "Every StudyLog post as a 3D map of 5,551 passages placed by meaning. Ask a question and the matching passages light up, with the exact section linked.",
      why: "173 long-form posts were only browsable by date and tag. Atlas makes the whole notebook searchable by meaning and visible at a glance.",
      how: [
        "Parses the rendered blog into 5,551 passages and builds a BM25 index plus a TF-IDF matrix at build time.",
        "Reduces it with a randomized truncated SVD written from scratch, then lays passages out in 3D with UMAP.",
        "Hybrid search fuses keyword and semantic rankings with reciprocal rank fusion: 85% hit@1, 98% hit@5 on a 60-question eval.",
        "React Three Fiber draws every passage in one draw call with a custom GLSL shader. No model, API key or server."
      ],
      milestones: [["Passage index + BM25", true], ["Semantic space (SVD) + UMAP layout", true], ["60-question retrieval eval", true], ["3D map + search UI", true], ["Neural embeddings + cited answers", false]],
      stack: ["TypeScript", "React Three Fiber", "GLSL", "BM25", "SVD", "UMAP"],
      links: { live: "/atlas/" }
    },
    {
      id: "intonation", tier: "flagship", motif: "pitch", name: "Intonation Studio", year: 2026, kind: "Real-time audio", status: "wip",
      pitch: "A browser practice room that hears my violin or piano and shows pitch, rhythm and progress in real time.",
      why: "It joins engineering with something I actually practise. Tuners tell you one note at a time; this scores whole scales and tracks how your intonation improves.",
      how: [
        "Pitch detection (YIN / McLeod) inside an AudioWorklet, targeting under 30 ms latency.",
        "Scale and arpeggio drills by grade: it plays a target, you play it back, it scores each note in cents.",
        "Practice history with a per-note intonation heatmap across the fingerboard or keyboard.",
        "A live visualiser with a custom shader that responds to pitch accuracy and dynamics."
      ],
      milestones: [["Tuner prototype in an AudioWorklet", false], ["Drill engine + per-note scoring", false], ["Practice history + heatmap", false], ["Visualiser + mobile polish", false], ["Write-up: pitch detection from scratch", false]],
      stack: ["TypeScript", "Web Audio", "AudioWorklet", "DSP", "Three.js", "Postgres"],
      links: {}
    },
    {
      id: "arena", tier: "flagship", motif: "cards", name: "TripleFind Arena", year: 2026, kind: "Distributed systems", status: "wip",
      pitch: "My memory game rebuilt as real-time multiplayer: rooms, matchmaking, replays and a ranked ladder, on infrastructure defined in code.",
      why: "TripleFind is a single-player browser game. Arena turns the same rules into a backend showcase you can watch under load.",
      how: [
        "Authoritative Node.js + TypeScript game server over WebSockets: the server deals and validates every flip.",
        "Rooms and quick-match via a Redis queue, with reconnect-and-resume when a player drops.",
        "Matches stored as event logs in MongoDB, giving replays and a leaderboard projection for free.",
        "Docker, Kubernetes and Terraform on AWS, with OpenTelemetry traces and a published load test."
      ],
      milestones: [["Shared game-logic package", false], ["Single-node multiplayer + reconnect", false], ["Event-sourced replays + leaderboard", false], ["Kubernetes + Terraform deploy", false], ["Observability + load test", false]],
      stack: ["Node.js", "TypeScript", "WebSockets", "Redis", "MongoDB", "Kubernetes", "Terraform"],
      links: { original: "/triplefind/" }
    },
    {
      id: "layerline", tier: "flagship", motif: "layers", name: "Layerline", year: 2026, kind: "Geometry + WebAssembly", status: "wip",
      pitch: "A 3D-printing slicer that runs in the browser: load an STL, slice it, preview the toolpaths and export G-code.",
      why: "It connects my 3D printing, C++, linear algebra and Three.js notes in one artefact, and ends in a physical part you can hold.",
      how: [
        "C++ slicing core compiled to WebAssembly, running in a Web Worker so the UI never freezes.",
        "Planar slicing into closed polygons, perimeters by polygon offsetting, rectilinear infill.",
        "G-code export for Marlin / Klipper with print-time and filament estimates.",
        "Toolpath preview with instanced line rendering and layer scrubbing."
      ],
      milestones: [["C++ core + reference mesh tests", false], ["Emscripten build in a Worker", false], ["Perimeters, infill, G-code", false], ["Toolpath viewer", false], ["Print a real part + benchmarks", false]],
      stack: ["C++", "WebAssembly", "Web Workers", "Three.js", "Computational geometry"],
      links: {}
    },
    {
      id: "studylog", tier: "experiment", motif: "dots", name: "StudyLog", year: 2022, kind: "Knowledge base", status: "live",
      pitch: "A public engineering notebook: 174 long-form notes on databases, cloud, maths, 3D printing and music.",
      how: ["Custom build pipeline with static export", "Diagrams, KaTeX and local full-text search"],
      stack: ["Next.js", "Markdown", "KaTeX", "Python"], links: { live: "/blog/" }
    },
    {
      id: "chilltimer", tier: "experiment", motif: "rings", name: "ChillTimer", year: 2023, kind: "Focus tool", status: "live",
      pitch: "An immersive Pomodoro timer with lofi music, ambient sounds, video scenes and weekly focus stats.",
      how: ["Music and ambient mixer", "Scene backgrounds", "Weekly and all-time stats in localStorage"],
      stack: ["JavaScript", "CSS", "HTML5 media"], links: { live: "/ptimer/" }
    },
    {
      id: "triplefind", tier: "experiment", motif: "cards", name: "TripleFind", year: 2023, kind: "Game", status: "live",
      pitch: "Find the triples against the clock. The faster you find one the more it's worth; re-flipping a card you've seen costs you.",
      how: ["Card count adapts to screen size", "Time-proportional scoring", "Scene transitions and result analysis"],
      stack: ["JavaScript", "DOM", "CSS"], links: { live: "/triplefind/" }
    },
    {
      id: "reconstruction", tier: "experiment", motif: "mesh", name: "3D Reconstruction", year: 2024, kind: "Final year project", status: "source",
      pitch: "A three-tier system for turning images into 3D models: web client, Node API and Python backend.",
      how: ["Web client", "Node.js API", "Python processing backend"],
      stack: ["JavaScript", "Node.js", "Python"], links: { source: "https://github.com/InvokFung/3dreconstruction" }
    },
    {
      id: "shapecalc", tier: "experiment", motif: "geo", name: "Shape Calculator", year: 2023, kind: "Utility", status: "source",
      pitch: "Compute the properties of shapes straight from their coordinates.",
      stack: ["JavaScript"], links: { source: "https://github.com/InvokFung/ShapeCalculator" }
    },
    {
      id: "genius", tier: "experiment", motif: "dots", name: "genius", year: 2021, kind: "Experiment", status: "source",
      pitch: "A playful little web experiment from the early days.",
      stack: ["HTML", "CSS", "JS"], links: { source: "https://github.com/InvokFung/genius" }
    }
  ],

  // Snapshot of /blog (174 posts as of 2026-10-02).
  writing: {
    total: 174,
    since: 2022,
    latest: [
      { date: "2026-09-25", title: "Desk Health: Eye Strain, Posture, Movement and Setup", url: "/blog/2026/09/25/dev_24_desk_health/" },
      { date: "2026-09-20", title: "Design Docs and READMEs People Actually Read", url: "/blog/2026/09/20/dev_22_design_docs_readmes/" },
      { date: "2026-09-07", title: "RAG from Scratch in Python", url: "/blog/2026/09/07/dev_19_rag_from_scratch/" }
    ]
  }
};
