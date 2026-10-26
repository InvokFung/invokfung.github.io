// The lists on the page, filled from data.js before the film starts: the years up the mountain, the
// three ways I work, the toolbox's shelves, what's next, and the counts.
(function () {
  var D = window.PORTFOLIO || {}, $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var path = D.path || [];
  var years = $('#years');
  if (years) years.innerHTML = path.map(function (p) {
    return '<li class="yr"><span class="sr">' + esc(p.y) + '</span><h3 class="r">' + esc(p.r) + '</h3><p class="d">' + esc(p.d) + '</p></li>';
  }).join('');
  var track = $('.path .track');
  if (track) track.insertAdjacentHTML('beforeend', path.map(function (p, k) { return '<i style="top:' + (k / Math.max(1, path.length - 1) * 100).toFixed(2) + '%"></i>'; }).join(''));
  var LINKS = { '#path': '#path', '#work': '#work', '#work/tracewise': '/tracewise/' };
  var belt = $('#belt');
  if (belt) belt.innerHTML = ((D.whoami || {}).lines || []).map(function (l, k) {
    return '<article class="way"><p class="i">0' + (k + 1) + ' / 03</p><h3>' + esc(l.k) + '</h3><p class="big"><b>' + esc(l.n) + '</b><span>' + esc(l.unit) + '</span></p><p class="proof">' + esc(l.proof) + '</p>' +
      (l.link ? '<a class="go" href="' + (LINKS[l.link] || l.link) + '" data-magnet>' + esc(l.linkText) + ' <i aria-hidden="true">→</i></a>' : '') + '</article>';
  }).join('');
  var skills = D.skills || [], n = 0;
  skills.forEach(function (g) { n += g.items.length; });
  var groups = $('#groups');
  if (groups) groups.innerHTML = skills.map(function (g) { return '<li><b>' + g.items.length + '</b><span>' + esc(g.group) + '</span></li>'; }).join('');
  var all = $('#all-tools');
  if (all) all.innerHTML = skills.map(function (g) { return g.items.map(function (it) { return '<li>' + esc(it[0]) + ', since ' + it[1] + '</li>'; }).join(''); }).join('');
  var next = (D.eras || []).filter(function (e) { return e.id === 'next'; })[0];
  var soon = $('#soon');
  if (soon && next) soon.innerHTML = next.events.map(function (e) {
    var t = e[1], c = t.indexOf(': ');
    return '<li><b>' + esc(c > 0 ? t.slice(0, c) : 'Next') + '</b><i aria-hidden="true"></i><span>' + esc(c > 0 ? t.slice(c + 2) : t) + '</span></li>';
  }).join('');
  var counts = {
    flagships: (D.projects || []).filter(function (p) { return p.tier === 'flagship'; }).length,
    notes: (window.PORTFOLIO_NOTES || []).length,
    titles: ((D.profile || {}).career || []).length,
    skills: n
  };
  [].forEach.call(document.querySelectorAll('[data-count]'), function (el) { var v = counts[el.dataset.count]; if (v) el.textContent = v; });
})();
