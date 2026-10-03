/*
 * Everything the portfolio shows lives in this file.
 * The page renders its output AND writes its own "source code" from this data,
 * so editing an entry here updates both.
 *
 *   New project   → add an object to `projects` (tier "flagship" or "experiment").
 *   New skill     → add it to a group in `skills`; projects that list it in `stack` or `uses` are wired to it.
 *   New chapter   → add an object to `eras` (shown in the history loop, oldest first).
 *   Blog numbers  → update `writing` (a snapshot of /blog at the time of editing).
 */
window.PORTFOLIO = {
  profile: {
    name: "Alan Fung",
    handle: "InvokFung",
    role: "Software Engineer",
    status: "open to software engineering roles",
    tagline: "Full-stack engineer who goes down to the maths underneath: search engines, real-time systems and the feel of a good interface.",
    email: "aflung10@gmail.com",
    github: "https://github.com/InvokFung",
    firstCommit: 2018,
    // the measured number the hero leads with
    metric: ["85%", "hit@1, my search engine"],
    focus: ["full-stack web", "search & retrieval", "real-time systems", "graphics"],
    about: [
      "I'm a developer obsessed with charm, stunning visual effects and user experience.",
      "I don't stop at the interface: I go down into databases, networking, infrastructure and the maths underneath, and I measure what I build."
    ]
  },

  // The whoami() statement. Each {token} is interactive and shows the evidence behind it.
  statement: "I'm Alan, a software engineer. I {ship full-stack products}, {measure what I build}, {learn the theory underneath} and {write it all down}. Off the keyboard, I {play the violin}.",
  traits: [
    { k: "ship full-stack products", n: "7", unit: "shipped", text: "A three-tier 3D reconstruction system (web client, Node API, Python backend), a search engine that runs in the browser, a memory game, a focus timer and more. Three bigger builds are in progress.", link: "#work", linkText: "see the work ↓" },
    { k: "measure what I build", n: "85%", unit: "hit@1", text: "StudyLog Atlas is scored on 60 real questions: the right post ranks first 85% of the time and lands in the top five 98% of the time, in about half a millisecond per query.", link: "/atlas/", linkText: "try Atlas →" },
    { k: "learn the theory underneath", n: "24", unit: "maths notes", text: "Linear algebra, abstract algebra and real analysis. It pays off: Atlas runs on a randomized SVD and an eigensolver I wrote myself." },
    { k: "write it all down", n: "174", unit: "technical notes", text: "A 30-part MongoDB course, 14 parts of Three.js, Kubernetes, AWS, PostgreSQL, design docs: every deep dive becomes a long-form post on StudyLog, my public engineering notebook.", link: "/blog/", linkText: "open StudyLog →" },
    { k: "play the violin", n: "19", unit: "music notes", text: "Violin notes, and I'm teaching myself the piano. Intonation Studio, a practice room that listens to you play, grows out of this." }
  ],

  /*
   * skills(): grouped, with the year of the first evidence. A project proves a skill when the
   * skill's name is in its `stack` or `uses`. `proof` backs up a skill with no shipped project yet.
   */
  skills: [
    { group: "Languages", items: [
      ["TypeScript", 2025], ["JavaScript", 2020], ["Python", 2024],
      ["C++", 2022, "Data structures in C++ (2022), then a 6-part modern C++ series on StudyLog"],
      ["Java", 2018, "My first repository: a Java group project"]
    ] },
    { group: "Frontend & graphics", items: [
      ["React", 2026], ["Next.js", 2025],
      ["Vue", 2026, "4-part Vue series on StudyLog: reactivity internals, compiler, production"],
      ["Three.js", 2025, "14-part Three.js course on StudyLog: PBR, instancing, shaders, physics"],
      ["GLSL", 2025, "Shaders and post-processing chapters of the Three.js course"],
      ["WebAssembly", 2026]
    ] },
    { group: "Backend & data", items: [
      ["Node.js", 2024],
      ["Search & retrieval", 2026],
      ["MongoDB", 2025, "30-part MongoDB course on StudyLog: indexes, sharding, change streams, CQRS"],
      ["PostgreSQL", 2025, "8-part PostgreSQL course on StudyLog: planner, MVCC, replication"]
    ] },
    { group: "Cloud & infra", items: [
      ["Docker", 2025, "8-part Docker and Kubernetes series on StudyLog"],
      ["Kubernetes", 2026, "8-part Docker and Kubernetes series on StudyLog"],
      ["AWS", 2025, "9-part AWS series on StudyLog: VPC, compute, serverless, observability"],
      ["Terraform", 2026, "Infrastructure as code chapter of the AWS series"],
      ["Networking", 2022, "Data communications and networking notes (2022), VPC design on AWS"]
    ] },
    { group: "Maths & making", items: [
      ["Linear algebra", 2025],
      ["3D printing", 2026, "8-part 3D printing course on StudyLog: slicing, tolerances, functional parts"]
    ] }
  ],

  /*
   * The history loop, oldest first. `picked` = skills that chapter added.
   * `events` also feed `git log` in the terminal.
   */
  eras: [
    {
      id: "2018", label: "2018", title: "First commit", role: "Student",
      text: "A Java group project became my first repository on GitHub. Everything since has been one long commit history.",
      picked: ["Java", "Git"],
      events: [["2018-11", "First repo: a Java group project"]]
    },
    {
      id: "2020", label: "2020", title: "Tinkering", role: "Tinkerer",
      text: "Side experiments to see how things work: serverless databases with FaunaDB, a chess board, and small playful web pages.",
      picked: ["JavaScript", "Serverless DBs", "HTML/CSS"], projects: ["genius"],
      events: [["2020-09", "Experiments with serverless databases (FaunaDB)"], ["2020-11", "A chess board"], ["2021-07", "genius, a fun web experiment"]]
    },
    {
      id: "2022", label: "2022", title: "Foundations", role: "Computer science student",
      text: "Computer science fundamentals: data structures in C++, Java, networking and logic circuits. I built this site and started StudyLog to publish what I learn.",
      picked: ["C++", "Networking", "Logic circuits"], projects: ["studylog"],
      events: [["2022-05", "git init invokfung.github.io"], ["2022-05", "Data structures in C++, Java, networking"]]
    },
    {
      id: "2023", label: "2023", title: "Shipping small things", role: "Builder",
      text: "I started turning ideas into things people can click: a memory game with time-proportional scoring, a focus timer, and a coordinate-geometry calculator.",
      picked: ["DOM", "Game logic", "Responsive UI"], projects: ["triplefind", "chilltimer", "shapecalc"],
      events: [["2023-02", "TripleFind goes live"], ["2023-03", "First version of ChillTimer"], ["2023-06", "Shape Calculator"]]
    },
    {
      id: "2024", label: "2024", title: "Full stack", role: "Final-year student",
      text: "My final year project was a three-tier 3D reconstruction system: a web client, a Node API and a Python processing backend.",
      picked: ["Python", "Node.js", "REST APIs"], projects: ["reconstruction"],
      events: [["2024-02", "Ship 3D Reconstruction, my final year project"], ["2024-09", "Browser automation with Puppeteer"], ["2024-12", "Python series begins"]]
    },
    {
      id: "2025", label: "2025", title: "Going deep", role: "Software engineer",
      text: "Depth on the backend and in graphics: MongoDB from indexes to sharding, PostgreSQL internals, modern C++, Three.js shaders and instancing, linear algebra, then containers and AWS.",
      picked: ["TypeScript", "MongoDB", "PostgreSQL", "Three.js", "Docker"],
      events: [["2025-03", "MongoDB: indexes, aggregation, sharding"], ["2025-06", "Three.js: PBR, instancing, GLSL shaders"], ["2025-09", "PostgreSQL: planner, MVCC, replication"], ["2025-11", "Containers from first principles"]]
    },
    {
      id: "2026", label: "2026", title: "Building in the open", role: "Software engineer",
      text: "Cloud infrastructure (AWS, Kubernetes, Terraform) and modern frontend (React, Vue, Next.js). Then StudyLog Atlas: a search engine with a WebAssembly SIMD kernel, measured at 85% hit@1.",
      picked: ["Kubernetes", "Terraform", "React", "WebAssembly", "Search & retrieval"], projects: ["atlas"],
      events: [["2026-01", "Kubernetes architecture, AWS at scale"], ["2026-03", "Terraform and React 19"], ["2026-10", "Ship StudyLog Atlas"], ["2026-10", "Rebuild this site as a program"]]
    },
    {
      id: "next", label: "next", title: "What's next", role: "Building flagships",
      text: "Three flagship builds are under way: a practice room that hears my violin, my card game as real-time multiplayer on Kubernetes, and a 3D-printing slicer in C++ compiled to WebAssembly.",
      picked: ["Web Audio", "WebSockets", "Emscripten"], projects: ["intonation", "arena", "layerline"],
      events: [["soon", "Intonation Studio: tuner prototype"], ["soon", "TripleFind Arena: multiplayer rooms"], ["soon", "Layerline: C++ slicing core"]]
    }
  ],

  /*
   * tier: "flagship" (big cards, case study) | "experiment" (smaller cards)
   * status: "live" | "source" | "wip"
   * motif: the generated cover: "passages" | "pitch" | "cards" | "layers" | "rings" | "mesh" | "geo" | "dots" (default)
   * metrics: measured numbers [value, label], shown on the card and the case study.
   * uses: skills the project proves beyond the ones already named in `stack`.
   * why / how / milestones are optional and fill the case study.
   */
  projects: [
    {
      id: "atlas", tier: "flagship", motif: "passages", name: "StudyLog Atlas", year: 2026, kind: "Search engine", status: "live",
      pitch: "A hybrid search engine that runs entirely in the browser over 5,551 passages of my notes, and shows its work: every stage of a query reports its output and its time on your device.",
      why: "173 long-form posts were only browsable by date and tag. Atlas makes the whole notebook searchable by meaning, with no model, API key or server.",
      how: [
        "Build step in TypeScript: parse the rendered blog into 5,551 passages and pack a BM25 inverted index into typed arrays.",
        "Latent semantic analysis: a TF-IDF matrix reduced to 96 dimensions by a randomized truncated SVD, with my own Gram-Schmidt and Jacobi eigensolver.",
        "Query time: int8 passage vectors scored by a WebAssembly SIMD kernel (about 6× faster than the JavaScript loop), a bounded min-heap for top-k, then reciprocal rank fusion of the two rankings.",
        "Measured, not guessed: a 60-question benchmark reruns live in the browser; npm test checks the kernel is bit-identical to the JavaScript fallback."
      ],
      metrics: [["85%", "hit@1"], ["98%", "hit@5"], ["~0.5 ms", "per query"], ["82 kB", "gzipped"]],
      milestones: [["Passage index + BM25", true], ["LSA from a from-scratch SVD", true], ["60-question benchmark", true], ["WASM SIMD kernel + pipeline UI", true], ["Neural embeddings + cited answers", false]],
      stack: ["TypeScript", "React", "WebAssembly", "BM25", "LSA / SVD", "Vite"],
      uses: ["Search & retrieval", "Linear algebra"],
      links: { live: "/atlas/", source: "https://github.com/InvokFung/invokfung.github.io/tree/main/atlas-src" }
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
      stack: ["TypeScript", "Web Audio", "AudioWorklet", "DSP", "Three.js", "PostgreSQL"],
      uses: ["GLSL"],
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
      uses: ["Docker", "AWS", "Networking"],
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
      uses: ["3D printing", "Linear algebra"],
      links: {}
    },
    {
      id: "studylog", tier: "experiment", motif: "dots", name: "StudyLog", year: 2022, kind: "Knowledge base", status: "live",
      pitch: "My public engineering notebook: 174 long-form technical notes on databases, cloud, C++, graphics and maths, with diagrams and full-text search.",
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
      stack: ["HTML", "CSS", "JavaScript"], links: { source: "https://github.com/InvokFung/genius" }
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
