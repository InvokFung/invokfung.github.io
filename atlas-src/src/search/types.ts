export interface Post {
  title: string;
  url: string;
  date: string;
  category: number;
  tags: string[];
  /** Index of this post's first chunk; its chunks are contiguous. */
  first: number;
  count: number;
}

export interface Chunk {
  /** Post index. */
  p: number;
  /** Heading path, e.g. "Chapter 2 › Causes". Empty for a post's intro. */
  h: string;
  /** Heading anchor id on the post page, or "" for the intro. */
  a: string;
  /** Word count of the passage. */
  w: number;
}

export interface Section {
  name: string;
  type: "u8" | "u16" | "u32" | "i8" | "f32";
  offset: number;
  length: number;
}

export interface Meta {
  builtAt: string;
  categories: string[];
  posts: Post[];
  chunks: Chunk[];
  /** Vocabulary in term-id order. */
  terms: string[];
  bm25: { k1: number; b: number; avgLen: number };
  lsa: { k: number; /** term id -> row in V, -1 if not in the LSA vocabulary */ rows: number[]; idf: number[] };
  sections: Section[];
  stats: {
    vocabulary: number;
    lsaVocabulary: number;
    postings: number;
    /** Share of the TF-IDF matrix's variance the k dimensions keep. */
    variance: number;
    avgTokens: number;
    indexBytes: number;
    /** Passage window and overlap, in characters. */
    window: number;
    overlap: number;
    parseSeconds: number;
    indexSeconds: number;
    svdSeconds: number;
  };
}

export interface EvalReport {
  n: number;
  summary: Record<"bm25" | "lsa" | "hybrid", { hit1: number; hit5: number; mrr: number }>;
  questions: { q: string; expect: string[]; rank: Record<string, number | null> }[];
}

/** Text of each chunk of one post, fetched lazily from data/text/<post>.json. */
export type PostText = string[];
