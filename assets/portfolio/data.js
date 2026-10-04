/*
 * Everything the portfolio shows lives in this file.
 *
 *   New project   → add an object to `projects` (tier "flagship" or "experiment"); a flagship also
 *                   wants footage in assets/portfolio/media/<id>.mp4 + <id>.webp and a sketch in sims.js.
 *   New skill     → add it to a group in `skills`; projects that list it in `stack` or `uses` are wired to it.
 *   New step      → add it to `path` (the career line, oldest first).
 *   Blog numbers  → update `writing` (a snapshot of /blog at the time of editing).
 */
window.PORTFOLIO = {
  profile: {
    name: "Alan Fung",
    handle: "InvokFung",
    role: "Forward Deployed Engineer",
    education: "Information Engineering",
    // [title, from], oldest first; the last one is the current role
    career: [["Web Developer", 2023], ["Full Stack Engineer", 2024], ["Software Engineer", 2025], ["Forward Deployed Engineer", 2026]],
    // the hero line; <em>…</em> is drawn in the gradient
    tagline: "I go where the software <em>breaks.</em>",
    email: "aflung10@gmail.com",
    github: "https://github.com/InvokFung",
    firstCommit: 2018,
    focus: ["LLM systems", "observability", "customer data", "full-stack web", "search & retrieval", "graphics"]
  },

  /*
   * About: three lines, each with its big number. The proof shows under it.
   * `aside`: the off-the-clock part, one short line each.
   */
  whoami: {
    lines: [
      { k: "Go where the problem lives.", n: "FDE", unit: "since 2026", proof: "Closer to the people using the software every year.", link: "#path", linkText: "How I got here" },
      { k: "Ship the whole stack.", n: "7", unit: "flagships, all live", proof: "Each one runs in your browser, source included.", link: "#work", linkText: "See them" },
      { k: "Put a number on it.", n: "98.9%", unit: "culprit found first", proof: "Tracewise, over 200 injected faults. The obvious guess gets 66.1%.", link: "#work/tracewise", linkText: "Break something" }
    ],
    aside: [
      { icon: "♪", text: "Off the clock I play violin. That's why this page can hear you.", link: "#hero", linkText: "Sing to it" },
      { icon: "✎", text: "I write up everything I learn: {notes} notes so far.", link: "/blog/", linkText: "StudyLog" }
    ]
  },

  // Section headings. <em>…</em> is drawn in the gradient. {notes} is the note count.
  sections: {
    work: "Seven questions I couldn't <em>leave alone.</em>",
    path: "One repo in 2018. <em>Forward deployed</em> in 2026.",
    tools: "Pick a tool to see where I used it."
  },

  // The career line, oldest first. `d` opens under the step.
  path: [
    { y: "2018", r: "First commit", d: "A Java group project became repo one." },
    { y: "2020", r: "Information Engineering", d: "Signals, probability, networks. Half my projects run on them." },
    { y: "2023", r: "Web Developer", d: "Small games and tools, finished and live." },
    { y: "2024", r: "Full Stack Engineer", d: "Photos into 3D models, then a web metaverse." },
    { y: "2025", r: "Software Engineer", d: "Databases, C++, shaders, containers: 86 notes." },
    { y: "2026", r: "Forward Deployed Engineer", d: "Closer to the people using it. Seven projects, all live." }
  ],

  /*
   * skills(): grouped, with the year of the first evidence. A project proves a skill when the
   * skill's name is in its `stack` or `uses`. `proof` backs up a skill with no shipped project yet.
   */
  skills: [
    { group: "Languages", items: [
      ["TypeScript", 2025], ["JavaScript", 2020, "Web developer since 2023; earlier games and tools are on GitHub"], ["Python", 2024],
      ["C++", 2022, "Data structures in C++ (2022), then a 6-part modern C++ series on StudyLog"],
      ["Java", 2018, "My first repository: a Java group project"]
    ] },
    { group: "Frontend & graphics", items: [
      ["React", 2023], ["Next.js", 2025],
      ["Vue", 2026, "4-part Vue series on StudyLog: reactivity internals, compiler, production"],
      ["Three.js", 2024, "14-part Three.js course on StudyLog: PBR, instancing, shaders, physics"],
      ["GLSL", 2025, "Shaders and post-processing chapters of the Three.js course"],
      ["WebAssembly", 2026], ["Web Workers", 2026], ["Web Audio", 2026]
    ] },
    { group: "Backend & data", items: [
      ["Node.js", 2024], ["WebSockets", 2024],
      ["Search & retrieval", 2026], ["LLM integration", 2026], ["Entity resolution", 2026], ["Data quality & PII", 2026],
      ["MongoDB", 2025, "30-part MongoDB course on StudyLog: indexes, sharding, change streams, CQRS"],
      ["PostgreSQL", 2025, "8-part PostgreSQL course on StudyLog: planner, MVCC, replication"]
    ] },
    { group: "Cloud & infra", items: [
      ["Docker", 2025, "8-part Docker and Kubernetes series on StudyLog"],
      ["Kubernetes", 2026, "8-part Docker and Kubernetes series on StudyLog"],
      ["AWS", 2025, "9-part AWS series on StudyLog: VPC, compute, serverless, observability"],
      ["Terraform", 2026, "Infrastructure as code chapter of the AWS series"],
      ["Networking", 2022, "Data communications and networking notes (2022), VPC design on AWS"],
      ["Observability", 2025], ["Reliability engineering", 2026]
    ] },
    { group: "Maths & making", items: [
      ["Linear algebra", 2025], ["Statistics", 2022], ["Signal processing", 2020], ["Computational geometry", 2026],
      ["3D printing", 2026, "8-part 3D printing course on StudyLog: slicing, tolerances, functional parts"]
    ] }
  ],

  /*
   * The long history, oldest first, for the terminal (`git log`, `checkout <year>`).
   * `picked` = skills that chapter added. `events` feed `git log`.
   * `built`: smaller things shipped that year, [name, link]; a null link marks one that never shipped.
   * `grew`: [era id, where it started, project id], each flagship traced back to the chapter it grew from.
   */
  eras: [
    {
      id: "2018", label: "2018", title: "First commit", role: "Student",
      text: "A Java group project became my first repository. Nobody told me it was commit one of a very long log.",
      picked: ["Java", "Git"],
      events: [["2018-11", "First repo: a Java group project"]]
    },
    {
      id: "2020", label: "2020", title: "Information Engineering", role: "University",
      text: "Signals, probability, networks, logic. The theory felt abstract at the time. Half my flagships run on it now.",
      picked: ["JavaScript", "HTML/CSS", "Signal processing"],
      built: [["genius", "https://github.com/InvokFung/genius"]],
      events: [["2020", "Start Information Engineering"], ["2020-09", "Serverless databases with FaunaDB"], ["2020-11", "A chess board in the browser"], ["2021", "genius, an early web experiment"]]
    },
    {
      id: "2022", label: "2022", title: "Foundations, written down", role: "Information Engineering",
      text: "Data structures, networking, statistics. I wrote up every course, because I only trust what I can explain. That became StudyLog.",
      picked: ["C++", "Networking", "Statistics", "Logic circuits"], projects: ["studylog"],
      events: [["2022-05", "git init invokfung.github.io"], ["2022-05", "Notes: networking, data structures, logic circuits"], ["2022-05", "Notes: statistics and probability models"]]
    },
    {
      id: "2023", label: "2023", title: "Shipping small things", role: "Web developer",
      text: "My first title. Interfaces for other people by day, small games and tools of my own by night. Small, finished and live became the habit.",
      picked: ["React", "Responsive UI", "DOM", "Game logic"],
      built: [["TripleFind", "/triplefind/"], ["Pomodoro timer", "/ptimer/"], ["Shape Calculator", "https://github.com/InvokFung/ShapeCalculator"]],
      events: [["2023", "Start as a web developer"], ["2023-02", "TripleFind goes live"], ["2023-03", "A pomodoro timer, later ChillTimer"], ["2023", "Shape Calculator"]]
    },
    {
      id: "2024", label: "2024", title: "Full stack, for real", role: "Full-stack engineer",
      text: "A final year project that turns photos into 3D models. Then a web metaverse that never shipped, and taught me exactly why.",
      picked: ["Node.js", "Python", "REST APIs", "Three.js", "WebSockets"],
      built: [["3D Reconstruction", "https://github.com/InvokFung/3dreconstruction"], ["Web metaverse", null]],
      events: [["2024", "Become a full-stack engineer"], ["2024-02", "Ship 3D Reconstruction, my final year project"], ["2024", "Try to build a web metaverse"], ["2024-09", "Browser automation with Puppeteer"], ["2024-12", "Python series begins on StudyLog"]]
    },
    {
      id: "2025", label: "2025", title: "Going below the surface", role: "Software engineer",
      text: "86 notes in one year: databases, modern C++, shaders, linear algebra, containers. Most of it ended up inside something I built.",
      picked: ["TypeScript", "MongoDB", "PostgreSQL", "GLSL", "Linear algebra", "Docker", "Observability"],
      events: [["2025", "Become a software engineer"], ["2025-02", "Modern C++ series begins"], ["2025-03", "MongoDB: indexes, aggregation, sharding"], ["2025-05", "Linear algebra, all the way to the SVD"], ["2025-06", "Three.js: PBR, instancing, GLSL shaders"], ["2025-08", "OpenTelemetry and observability"], ["2025-09", "PostgreSQL: planner, MVCC, replication"], ["2025-11", "Containers from first principles"]]
    },
    {
      id: "2026", label: "2026", title: "Forward deployed", role: "Forward Deployed Engineer",
      text: "Closer to the people using the software, and on the hook for what happens after the demo.",
      picked: ["Kubernetes", "Terraform", "LLM integration", "Reliability engineering", "Vue", "3D printing"],
      events: [["2026", "Become a Forward Deployed Engineer"], ["2026-01", "AWS at scale and Kubernetes"], ["2026-03", "Terraform, and React's rendering model"], ["2026-04", "3D printing, from slicing to strong parts"], ["2026-04", "Rebuild the pomodoro timer as ChillTimer"], ["2026-08", "How LLMs work, and coding with agents"], ["2026-09", "RAG from scratch"]]
    },
    {
      id: "now", label: "now", title: "The sequels", role: "Seven flagships",
      text: "Seven flagships, each the sequel to an earlier chapter. Pick a year to jump back to it.",
      picked: ["WebAssembly", "Web Workers", "Web Audio", "Search & retrieval", "Computational geometry", "Entity resolution", "Data quality & PII"],
      projects: ["relay", "tracewise", "onboard", "atlas", "intonation", "arena", "layerline"],
      grew: [["2026", "How LLMs work", "relay"], ["2025", "OpenTelemetry notes", "tracewise"], ["2022", "Probability models", "onboard"], ["2022", "StudyLog", "atlas"], ["2020", "Signals and systems", "intonation"], ["2023", "TripleFind", "arena"], ["2025", "Modern C++", "layerline"]],
      events: [["2026-10", "Ship Relay, Tracewise and Onboard"], ["2026-10", "Ship Atlas, Studio, Arena and Layerline"], ["2026-10", "Rebuild this site: a name you can hear, tiles you can break"]]
    },
    {
      id: "next", label: "next", title: "What's next", role: "Still building",
      text: "Every flagship has one milestone left. After that, whatever I can't stop thinking about.",
      picked: [],
      events: [["soon", "Relay: an embedding match for paraphrases"], ["soon", "Onboard: learn from the review queue"], ["soon", "Tracewise: take traffic from a real OpenTelemetry Collector"], ["soon", "Arena: deploy to a real cluster"], ["soon", "Layerline: print a real part"], ["soon", "Atlas: neural embeddings + cited answers"], ["soon", "Write-up: pitch detection from scratch"]]
    }
  ],

  /*
   * tier: "flagship" (on the stage, with footage and a case study) | "experiment" (linked from the footer)
   * status: "live" | "source" | "wip"
   * metrics: measured numbers [value, label]; the first is the headline on the stage.
   * uses: skills the project proves beyond the ones already named in `stack`.
   * featured: true marks the work closest to the day job; it comes first.
   * color: the project's colour on the stage and in its case study.
   * why / how / milestones are optional and fill the case study.
   */
  projects: [
    {
      id: "relay", color: "#ffb547", tier: "flagship", featured: true, name: "Relay", year: 2026, kind: "LLM gateway", status: "live",
      question: "When the model provider goes down, can the product stay up?",
      pitch: "An LLM gateway that keeps model calls safe, reliable and accountable. Each request passes nine stages, from PII redaction and an injection screen to a semantic cache, fallbacks across regions and a hash-chained audit log. Send your own prompt through it, to a simulator or to Claude with your own key.",
      why: "Once a model is inside a product, the hard questions are not about prompts: what happens to customer data on the way in, who pays when usage runs away, and what users see when the provider has an outage. Relay answers all three in one place, in front of every model call, and backs each answer with a benchmark.",
      how: [
        "Nine middleware stages, each a single handle(ctx, next) that can answer, reject, rewrite the request or watch the response stream. The core has no dependencies, runs unchanged in the browser and in Node, and keeps time on an injected clock, so tests and benchmarks run in virtual time.",
        "Redaction swaps emails, phones, Luhn-valid cards, IBANs and names for placeholders and restores them in the streamed answer, even when a placeholder is split across chunks. The cache tries an exact hash, then a MinHash and LSH near match behind a guard that checks numbers, negation and placeholders: without the guard, 47.8% of its hits would have been wrong answers.",
        "Resilience: per-attempt timeouts, retries with full jitter, fallback across models and regions, a circuit breaker per deployment on a Wilson bound, and hedged requests after the p95 first-token time. With 30% of upstream calls failing, success rises from 71.6% to 97.0%. Config changes roll out as an eval-gated canary, 5% to 25% to 100%, and roll back on a failing eval, error or latency gate.",
        "Measured, not guessed: npm run bench times every stage and replays failure, outage, heavy-tail and cache workloads, and 98 tests cover the core and the server. The README also prints where it stops: the injection screen caught none of 12 paraphrased attacks. It ships as a Node server with an Anthropic-compatible endpoint, Prometheus metrics and a Docker image."
      ],
      metrics: [["99.98%", "success in an outage, vs 68.6%"], ["1.4 s", "first-token p99, from 4.4\u00a0s"], ["387 µs", "median overhead, uncached"], ["70.9%", "cache hits, 0 false"]],
      milestones: [["Typed middleware chain + simulator", true], ["Redaction, screen, semantic cache", true], ["Fallbacks, breakers, hedging, budgets", true], ["Eval-gated canary + Node server", true], ["Embedding match for paraphrases", false]],
      stack: ["TypeScript", "React", "Node.js", "SSE", "Docker", "Prometheus", "MinHash", "Claude API"],
      uses: ["LLM integration", "Reliability engineering", "Data quality & PII", "Observability"],
      links: { live: "/relay/", source: "https://github.com/InvokFung/invokfung.github.io/tree/main/relay-src" }
    },
    {
      id: "tracewise", color: "#62b6ff", tier: "flagship", featured: true, name: "Tracewise", year: 2026, kind: "Observability", status: "live",
      question: "When checkout breaks, can the traces name the culprit?",
      pitch: "Break a microservice system and watch the tracing pipeline find the cause. Eleven simulated services send OpenTelemetry spans through your browser. Inject latency, errors or a bad deploy, and Tracewise opens an incident and ranks the likely culprit, evidence first.",
      why: "When something breaks on a customer's system, the first hour goes on finding where. Dashboards show what got slower, not what caused it: across these runs, blaming the service closest to the alert found the real cause only 17% of the time. Tracewise asks whether traces can answer the only question that matters in an incident: which service do we fix?",
      how: [
        "A seeded discrete-event simulation of a checkout system (gateway, auth, orders, payments, a Postgres database, a Redis cache, a card API and more) with worker pools, timeouts, retries and a Kafka-style consumer, so slowness cascades the way it does in production.",
        "Spans arrive out of order and are assembled into traces as they finish. Every trace feeds RED metrics and exclusive time before sampling, with percentiles from a DDSketch written from scratch (within 1%). A tail sampler then keeps every error trace, every trace slower than its flow's rolling p99, and a token-bucket share of the rest.",
        "Detection runs EWMA forecasts, MAD-scaled z-scores and CUSUM per flow and minute, and SLO alerts follow the SRE workbook's multi-window burn-rate rules. The ranking blends a personalised PageRank blame walk from caller to callee with anomaly scores and a diff of the critical path.",
        "Measured, not guessed: npm run eval replays 200 seeded faults on a held-out seed, 171.7 million spans, and scores Tracewise against three dashboard heuristics; 58 tests cover the pieces, and ingest runs at 653k spans a second on one thread. The simulator is cleaner than production, and the README says where the method could break. Real OTLP/JSON files can be dropped in for the same map, metrics and waterfalls."
      ],
      metrics: [["98.9%", "culprit first, vs 66.1%"], ["171 / 171", "user-visible faults caught"], ["2.0 min", "median to detect"], ["0", "false alarms in 42 h"]],
      milestones: [["Simulated 11-service system", true], ["Traces, RED metrics, DDSketch", true], ["Anomaly detection + burn-rate alerts", true], ["Root-cause ranking + 200-fault eval", true], ["OTLP receiver for a real Collector", false]],
      stack: ["TypeScript", "React", "Web Workers", "OpenTelemetry", "DDSketch", "PageRank", "Canvas 2D"],
      uses: ["Observability", "Statistics", "Reliability engineering"],
      links: { live: "/tracewise/", source: "https://github.com/InvokFung/invokfung.github.io/tree/main/tracewise-src" }
    },
    {
      id: "onboard", color: "#4fe3c1", tier: "flagship", featured: true, name: "Onboard", year: 2026, kind: "Customer data", status: "live",
      question: "Can three messy exports become one customer table you'd trust?",
      pitch: "A CRM, a billing system and a help desk each remember the same 4,000 customers a little differently. Feed in all three exports and one customer table comes out, every value traced to the file, row and column it came from. It runs entirely in your browser.",
      why: "Every customer project starts with their data, and their data never agrees with itself. Onboard is that first week turned into a tool: profile it, protect it, map it, decide who is who, and score every one of those decisions against the truth.",
      how: [
        "Ingest and profile: a CSV parser that scans char codes and sniffs delimiters, BOMs and quoted line breaks, then a profile per column with a HyperLogLog distinct count (MurmurHash3) beside the exact one.",
        "PII is found in columns and inside free-text notes, then checked instead of trusted: Luhn for cards, mod-97 for IBANs. Regex alone managed 71% precision on the demo data; with the checks, 100%. Each type is masked, kept or tokenized with HMAC-SHA256 in WebCrypto.",
        "Columns are matched to 17 canonical fields one-to-one with the Hungarian algorithm, 12 data contracts quarantine test rows and records that identify nobody, and entity resolution does the rest: blocking skips 99.96% of 51.8 million pairs, Fellegi-Sunter weights learned by EM score what is left, guard rules become cannot-link constraints in union-find, and unsure pairs go to a review queue instead of being guessed.",
        "Measured, not guessed: the 10,200 records are synthetic but carry the real mess (typos, nicknames, households, mixed date formats). npm run eval scores every stage against the generator's truth on five seeds, 66 tests cover the core, and the page runs the same modules in a Web Worker, with a SQL engine I wrote for querying the result."
      ],
      metrics: [["0.977", "match F1, vs 0.659 on email"], ["99.96%", "of pairs skipped"], ["48 / 48", "columns mapped"], ["6,439", "records per second"]],
      milestones: [["Seeded exports + ground truth", true], ["Profiling, PII, mapping, contracts", true], ["Fellegi-Sunter entity resolution", true], ["Golden records, review queue, SQL", true], ["Learn from the review queue", false]],
      stack: ["TypeScript", "React", "Web Workers", "Fellegi-Sunter + EM", "HyperLogLog", "WebCrypto"],
      uses: ["Entity resolution", "Data quality & PII", "Statistics"],
      links: { live: "/onboard/", source: "https://github.com/InvokFung/invokfung.github.io/tree/main/onboard-src" }
    },
    {
      id: "atlas", color: "#a78bfa", tier: "flagship", name: "StudyLog Atlas", year: 2026, kind: "Search engine", status: "live",
      question: "Can a search engine run with no server at all?",
      pitch: "A search engine over 5,551 passages of my notes that runs entirely in your browser: no server, no API key, no model. Ask it something and it shows its working, every stage with its output and its time on your device.",
      why: "I had 173 long posts and could only find them by date and tag. I wanted to ask my notebook a question and get the right paragraph back, without renting a server or shipping a model.",
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
      id: "intonation", color: "#c8ff4a", tier: "flagship", name: "Intonation Studio", year: 2026, kind: "Real-time audio", status: "live",
      question: "Can a browser tab hear a violin to the cent?",
      pitch: "A practice room that listens to a violin or a piano and scores a whole scale, note by note, to the cent. No instrument to hand? A synthesized violinist plays the drill for you.",
      why: "A tuner shows one note at a time, but practice is scales and arpeggios, and what matters is which notes keep drifting. Studio scores whole drills by grade and remembers how each note improves.",
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
      id: "arena", color: "#ff7ab6", tier: "flagship", name: "TripleFind Arena", year: 2026, kind: "Real-time multiplayer", status: "live",
      question: "Would my 2023 memory game survive 1,000 players?",
      pitch: "My 2023 memory game, rebuilt as a real-time race for two to four players on one board. The server deals and checks every flip, so no client can peek, and every match is an event log you can replay move by move.",
      why: "TripleFind was a single-player browser game. Making it a fair race meant solving real backend problems: hidden information, provably fair deals, reconnects and load.",
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
      id: "layerline", color: "#ff8a65", tier: "flagship", name: "Layerline", year: 2026, kind: "Geometry + WebAssembly", status: "live",
      question: "How small can a real 3D-printing slicer get?",
      pitch: "Drop in an STL, get G-code a printer can run. The slicer is 66 KB of WebAssembly built from freestanding C++17, with no Emscripten and no libc. It slices on a background thread and paints each layer the moment it is done.",
      why: "A slicer is computational geometry with no room for hand-waving: broken meshes, walls thinner than the nozzle, exact tie-breaking, and an output a printer has to obey. It pulls my C++, 3D printing and graphics notes into one tool.",
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
      id: "studylog", color: "#b7b6b0", tier: "experiment", name: "StudyLog", year: 2022, kind: "Knowledge base", status: "live",
      pitch: "Where every deep dive ends up: 174 long-form notes on databases, cloud, C++, graphics and maths, with diagrams, maths typesetting and full-text search.",
      how: ["Custom build pipeline with static export", "Diagrams, KaTeX and local full-text search"],
      stack: ["Next.js", "Markdown", "KaTeX", "Python"], links: { live: "/blog/" }
    }
  ],

  // Snapshot of /blog (174 posts as of 2026-10-02).
  writing: {
    total: 174,
    since: 2022,
    byYear: { 2022: 10, 2024: 10, 2025: 86, 2026: 68 },
    latest: [
      { date: "2026-09-25", title: "Desk Health: Eye Strain, Posture, Movement and Setup", url: "/blog/2026/09/25/dev_24_desk_health/" },
      { date: "2026-09-20", title: "Design Docs and READMEs People Actually Read", url: "/blog/2026/09/20/dev_22_design_docs_readmes/" },
      { date: "2026-09-07", title: "RAG from Scratch in Python", url: "/blog/2026/09/07/dev_19_rag_from_scratch/" }
    ]
  }
};
