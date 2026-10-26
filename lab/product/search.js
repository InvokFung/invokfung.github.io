/*
 * Search for the page: BM25 over my notes (assets/portfolio/notes.js: title, URL and ten distinctive
 * terms each) plus the page's own sections, projects and switches. Used by the Atlas demo and by the
 * palette that opens on "/" or Ctrl/Cmd+K. Small on purpose: the real Atlas fuses BM25 with LSA over
 * 5,551 passages; this is the keyword half, over titles.
 */
(function () {
  "use strict";

  var STOP = new Set("a an and are as at be by for from how i in is it of on or the to what when why with you your vs".split(" "));

  function stem(w) {
    if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
    if (w.length > 4 && /es$/.test(w) && /(ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    if (w.length > 5 && /ed$/.test(w)) return w.slice(0, -2);
    return w;
  }

  function tokens(s) {
    return (s.toLowerCase().match(/[a-z0-9+#]+/g) || []).filter(function (w) { return !STOP.has(w); }).map(stem);
  }

  function nice(title) {
    // "Series — 12 · Topic — Detail" reads as "Topic: Detail" with the series kept for the label
    var m = title.match(/^(.*?)\s+—\s+(\d+)\s+·\s+(.*)$/);
    var t = m ? m[3] : title;
    return { title: t.replace(/\s+—\s+/g, ": "), series: m ? m[1] + " " + m[2] : "Note" };
  }

  function Index(docs) {
    // docs: [{ title, body, ... }]; title terms count twice
    this.docs = docs;
    this.df = new Map();
    this.len = [];
    this.tf = [];
    var total = 0;
    for (var i = 0; i < docs.length; i++) {
      var ts = tokens(docs[i].title).concat(tokens(docs[i].title), tokens(docs[i].body || ""));
      var m = new Map();
      for (var j = 0; j < ts.length; j++) m.set(ts[j], (m.get(ts[j]) || 0) + 1);
      m.forEach(function (_, t) { this.df.set(t, (this.df.get(t) || 0) + 1); }, this);
      this.tf.push(m);
      this.len.push(ts.length);
      total += ts.length;
    }
    this.avg = total / Math.max(1, docs.length);
    this.vocab = Array.from(this.df.keys());
  }

  // query terms also match vocabulary words they are a prefix of, so results arrive while typing
  Index.prototype.expand = function (q) {
    var out = [];
    var qt = tokens(q);
    for (var i = 0; i < qt.length; i++) {
      var t = qt[i];
      if (this.df.has(t)) out.push([t, 1]);
      if (i === qt.length - 1 && t.length >= 2) {
        for (var k = 0; k < this.vocab.length; k++) {
          var v = this.vocab[k];
          if (v !== t && v.indexOf(t) === 0) out.push([v, 0.6]);
        }
      }
    }
    return { terms: out, raw: qt };
  };

  Index.prototype.search = function (q, n) {
    var t0 = performance.now();
    var ex = this.expand(q), N = this.docs.length, k1 = 1.2, b = 0.75;
    var scores = new Float64Array(N);
    for (var i = 0; i < ex.terms.length; i++) {
      var term = ex.terms[i][0], w = ex.terms[i][1];
      var idf = Math.log(1 + (N - this.df.get(term) + 0.5) / (this.df.get(term) + 0.5));
      for (var d = 0; d < N; d++) {
        var f = this.tf[d].get(term);
        if (!f) continue;
        scores[d] += w * idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * this.len[d] / this.avg));
      }
    }
    var top = [];
    for (var d2 = 0; d2 < N; d2++) if (scores[d2] > 0) top.push(d2);
    top.sort(function (x, y) { return scores[y] - scores[x]; });
    top = top.slice(0, n || 6);
    var best = top.length ? scores[top[0]] : 1;
    return {
      ms: performance.now() - t0,
      raw: ex.raw,
      hits: top.map(function (d) { return Object.assign({ score: scores[d], rel: scores[d] / best }, this.docs[d]); }, this)
    };
  };

  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // wrap words whose stem starts with a query term
  function mark(text, raw) {
    if (!raw.length) return esc(text);
    return text.split(/(\s+|[,.:;()·/?!-]+)/).map(function (part) {
      var st = stem(part.toLowerCase().replace(/[^a-z0-9+#]/g, ""));
      if (st && raw.some(function (r) { return st.indexOf(r) === 0 || r.indexOf(st) === 0 && st.length > 2; })) return "<mark>" + esc(part) + "</mark>";
      return esc(part);
    }).join("");
  }

  var notes = (window.PORTFOLIO_NOTES || []).map(function (n) {
    var t = nice(n[0]);
    return { kind: "Note", title: t.title, label: t.series, url: n[1], body: n[2] };
  });

  window.AFSearch = {
    notes: new Index(notes),
    count: notes.length,
    Index: Index,
    mark: mark,
    esc: esc
  };
})();
