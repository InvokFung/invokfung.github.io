"""Rebuild assets/portfolio/notes.js, the note index the Atlas tile searches.

Each StudyLog note becomes [title, url, its ten most distinctive terms by TF-IDF over the full
text], read from /blog/local_search.xml. Run from the repository root after publishing new posts:

    python3 assets/portfolio/notes.py
"""
import html
import json
import math
import re
from collections import Counter

STOP = set("""a an the and or of to in on for with by from as at is are was were be been being this
that these those it its into than then so such not no can could should would will just also more most
less very how what why when where which who whom your you we our they their there here about over
under between through each per vs via using use used up out off all any some one two three new part
parts""".split())


def tokens(text):
    text = re.sub(r"<[^>]+>", " ", text.lower())
    return [w for w in re.findall(r"[a-z][a-z0-9+#]{1,}", text) if w not in STOP and len(w) > 2]


def main():
    xml = open("blog/local_search.xml", encoding="utf-8").read()
    entries = re.findall(r"<entry><title>(.*?)</title><url>(.*?)</url><content>(.*?)</content>", xml, re.S)
    docs, df = [], Counter()
    for title, url, content in entries:
        tf = Counter(tokens(html.unescape(content)))
        docs.append((html.unescape(title).strip(), url, tf))
        df.update(tf.keys())
    n = len(docs)
    rows = []
    for title, url, tf in docs:
        in_title = set(tokens(title))
        score = {w: (1 + math.log(c)) * math.log(n / df[w]) for w, c in tf.items() if df[w] < n * 0.5 and w not in in_title}
        top = [w for w, _ in sorted(score.items(), key=lambda kv: -kv[1])[:10]]
        rows.append("  " + json.dumps([title, url, " ".join(top)], ensure_ascii=False))
    head = (
        "/*\n"
        " * The StudyLog index the Atlas tile searches: every note's title, URL and its ten most distinctive\n"
        " * terms (TF-IDF over the full text). A snapshot of /blog/local_search.xml; regenerate with\n"
        " * `python3 assets/portfolio/notes.py` after new posts.\n"
        " */\n"
    )
    with open("assets/portfolio/notes.js", "w", encoding="utf-8") as f:
        f.write(head + "window.PORTFOLIO_NOTES = [\n" + ",\n".join(rows) + "\n];\n")
    print(f"{len(rows)} notes")


if __name__ == "__main__":
    main()
