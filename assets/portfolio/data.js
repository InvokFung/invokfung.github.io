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
    { k: "ship full-stack products", n: "10", unit: "shipped", text: "A three-tier 3D reconstruction system (web client, Node API, Python backend), a search engine, a real-time pitch detector and a 3D-printing slicer that all run in the browser, a multiplayer game server load-tested to 1,000 clients, a focus timer and more.", link: "#work", linkText: "see the work ↓" },
    { k: "measure what I build", n: "85%", unit: "hit@1", text: "StudyLog Atlas is scored on 60 real questions: the right post ranks first 85% of the time and lands in the top five 98% of the time, in about half a millisecond per query. Intonation Studio's pitch detector is swept across the whole violin range: on clean, harmonic-rich tones its worst error is 0.17 cents. Layerline's WebAssembly core is benchmarked against the same algorithm in TypeScript and checked byte for byte against the native C++ build.", link: "/atlas/", linkText: "try Atlas →" },
    { k: "learn the theory underneath", n: "24", unit: "maths notes", text: "Linear algebra, abstract algebra and real analysis. It pays off: Atlas runs on a randomized SVD and an eigensolver I wrote myself." },
    { k: "write it all down", n: "174", unit: "technical notes", text: "A 30-part MongoDB course, 14 parts of Three.js, Kubernetes, AWS, PostgreSQL, design docs: every deep dive becomes a long-form post on StudyLog, my public engineering notebook.", link: "/blog/", linkText: "open StudyLog →" },
    { k: "play the violin", n: "19", unit: "music notes", text: "Violin notes, and I'm teaching myself the piano. So I built Intonation Studio, a practice room that hears a scale and scores every note to the cent.", link: "/studio/", linkText: "try Studio →" }
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
      ["WebAssembly", 2026], ["Web Workers", 2026], ["Web Audio", 2026]
    ] },
    { group: "Backend & data", items: [
      ["Node.js", 2024], ["WebSockets", 2026],
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
      ["Linear algebra", 2025], ["Signal processing", 2026], ["Computational geometry", 2026],
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
      text: "Cloud infrastructure (AWS, Kubernetes, Terraform) and modern frontend (React, Vue, Next.js). Then four flagships: StudyLog Atlas, a search engine measured at 85% hit@1; Intonation Studio, a pitch detector within 0.17 cents on clean tones; TripleFind Arena, a multiplayer game server load-tested to 1,000 clients; and Layerline, a 3D-printing slicer whose C++ core runs as WebAssembly, a median 8× faster than the same algorithm in TypeScript.",
      picked: ["Kubernetes", "Terraform", "React", "WebAssembly", "Search & retrieval", "Signal processing", "WebSockets", "Computational geometry", "Web Workers"], projects: ["atlas", "intonation", "arena", "layerline"],
      events: [["2026-01", "Kubernetes architecture, AWS at scale"], ["2026-03", "Terraform and React 19"], ["2026-10", "Ship StudyLog Atlas"], ["2026-10", "Ship Intonation Studio"], ["2026-10", "Ship TripleFind Arena"], ["2026-10", "Ship Layerline"], ["2026-10", "Rebuild this site as a program"]]
    },
    {
      id: "next", label: "next", title: "What's next", role: "Open to roles",
      text: "All four flagships are live, and each has one milestone left: deploy Arena to a real Kubernetes cluster, print a real part from Layerline's G-code, add neural embeddings and cited answers to Atlas, and write up pitch detection from scratch. Alongside that, a software engineering role where this is the day job.",
      picked: [],
      events: [["soon", "Arena: deploy to a real cluster"], ["soon", "Layerline: print a real part"], ["soon", "Atlas: neural embeddings + cited answers"], ["soon", "Write-up: pitch detection from scratch"]]
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
      id: "intonation", tier: "flagship", motif: "pitch", name: "Intonation Studio", year: 2026, kind: "Real-time audio", status: "live",
      pitch: "A practice room in the browser that listens to a violin or a piano and scores a whole scale, note by note, to the cent. A synthesized violinist can play the drill, so you can judge it without an instrument.",
      why: "It joins engineering with something I actually practise. A tuner shows one note at a time; this scores scales and arpeggios by grade and tracks how each note improves.",
      how: [
        "A McLeod pitch detector written from scratch in an AudioWorklet: the autocorrelation comes from one half-size real FFT, and a cosine fit gives the sub-sample lag (parabolic interpolation was off by up to 0.95 cents).",
        "Notes are segmented with hysteresis and scored on their vibrato-free centre: the contour is smoothed over exactly one vibrato cycle before steadiness is judged.",
        "Pitch frames never touch React state. The worklet fills a ring buffer that the gauge, strobe and a React Three Fiber stage with custom GLSL each read on their own animation frame.",
        "Measured, not claimed: accuracy sweeps against YIN, 47 unit tests and 13 headless-browser checks, including a fake microphone playing a rendered violin."
      ],
      metrics: [["0.17¢", "max error, clean"], ["0 / 182", "octave errors, noisy"], ["72 µs", "per frame"], ["29 / 29", "notes recovered"]],
      milestones: [["McLeod detector in an AudioWorklet", true], ["Drill engine + per-note scoring", true], ["Practice history + heatmap", true], ["GLSL live stage + demo violin", true], ["Write-up: pitch detection from scratch", false]],
      stack: ["TypeScript", "React", "Web Audio", "AudioWorklet", "Three.js", "GLSL", "Vite"],
      uses: ["Signal processing"],
      links: { live: "/studio/", source: "https://github.com/InvokFung/invokfung.github.io/tree/main/studio-src" }
    },
    {
      id: "arena", tier: "flagship", motif: "cards", name: "TripleFind Arena", year: 2026, kind: "Real-time multiplayer", status: "live",
      pitch: "My 2023 memory game rebuilt as a real-time race for two to four players on one shared board. An authoritative WebSocket server deals and checks every flip, and every match is an event log that replays and an Elo ladder are rebuilt from.",
      why: "TripleFind was a single-player browser game. Arena turns the same rules into a backend you can measure: hidden information, fair deals, reconnects and load.",
      how: [
        "Clients send intents. A Node and TypeScript server validates each one against a typed protocol, applies it with a pure, seeded engine and sends the public result to every player.",
        "Each match is an append-only event log with optimistic concurrency. Replays, results and the Elo ladder are projections of it, stored in MongoDB, a JSONL file or memory.",
        "Deals are provably fair: the server commits to a SHA-256 hash of the shuffled board, reveals it at the end, and the client checks it.",
        "On GitHub Pages the same server code and bots run in a Web Worker, so it plays without a backend. Docker, Compose and Kubernetes manifests (HPA, PDB, Ingress) are included and validated, not yet deployed to a cluster."
      ],
      metrics: [["1,000", "concurrent clients"], ["2.7 ms", "p99 flip round trip"], ["1,491", "flips per second"], ["50 / 50", "tests pass"]],
      milestones: [["Pure engine + typed protocol", true], ["Authoritative server + reconnect", true], ["Event-sourced replays + Elo ladder", true], ["Load test to 1,000 clients", true], ["Deploy to a real cluster", false]],
      stack: ["Node.js", "TypeScript", "WebSockets", "React", "MongoDB", "Docker", "Kubernetes"],
      uses: ["Networking"],
      links: { live: "/arena/", source: "https://github.com/InvokFung/invokfung.github.io/tree/main/arena-src", original: "/triplefind/" }
    },
    {
      id: "layerline", tier: "flagship", motif: "layers", name: "Layerline", year: 2026, kind: "Geometry + WebAssembly", status: "live",
      pitch: "A 3D-printing slicer that runs in the browser: drop in an STL, get printer-ready G-code. A freestanding C++17 core, compiled to 66 KB of WebAssembly with no Emscripten and no libc, slices in a Web Worker and streams every layer into a WebGL preview as soon as it is done.",
      why: "A slicer is computational geometry with no room for hand-waving: broken meshes, walls thinner than the nozzle, exact tie-breaking, and an output a printer has to follow. It ties my C++, 3D printing and Three.js notes into one tool.",
      how: [
        "Integer geometry on a 1 µm grid with exact 64-bit orientation tests: triangle–plane intersection, loop stitching that repairs gaps and flipped triangles, and island nesting by winding number.",
        "Walls come from mitred polygon offsets cleaned by my own N-ary polygon boolean; the same boolean finds the top and bottom skins in one pass. Rectilinear infill, then nearest-first ordering.",
        "Built with clang for wasm32 with no libc: an arena allocator over memory.grow and math from compiler builtins. The same sources run natively under ASan and UBSan, and the WASM output is byte-identical to the native build.",
        "The worker streams batches sized to about 12 ms, so the first layer appears in tens of milliseconds, and the preview draws every bead in one instanced GLSL draw call. The G-code time estimate replays a Marlin-style lookahead planner."
      ],
      metrics: [["8×", "median vs TypeScript"], ["21 ms", "full slice of a gear"], ["66 KB", "of WebAssembly"], ["38 / 38", "tests pass"]],
      milestones: [["C++ core + native tests", true], ["Freestanding WASM in a Worker", true], ["Walls, skins, infill, G-code", true], ["Streaming WebGL preview + benchmark", true], ["Print a real part", false]],
      stack: ["C++", "WebAssembly", "Web Workers", "TypeScript", "React", "Three.js", "GLSL"],
      uses: ["Computational geometry", "3D printing"],
      links: { live: "/layerline/", source: "https://github.com/InvokFung/invokfung.github.io/tree/main/layerline-src" }
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
