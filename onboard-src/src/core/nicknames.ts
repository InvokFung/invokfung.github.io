// Common given-name variants, as a matcher would ship them: each group is a
// set of names that can refer to the same person. This is general reference
// data, written independently of the synthetic generator's own list.

const GROUPS = [
  "robert bob bobby rob robbie bert",
  "william bill billy will willy liam",
  "richard rick ricky dick rich richie",
  "james jim jimmy jamie",
  "john jack johnny jon",
  "jonathan jon jonny nathan",
  "michael mike mikey mick mickey",
  "thomas tom tommy",
  "christopher chris kit topher",
  "christine chris chrissy tina",
  "daniel dan danny",
  "joseph joe joey",
  "anthony tony",
  "andrew andy drew",
  "alexander alex sasha xander sandy",
  "alexandra alex sasha sandra lexi",
  "benjamin ben benny",
  "matthew matt matty",
  "nicholas nick nicky nico",
  "stephen steve stevie",
  "steven steve stevie",
  "edward ed eddie ted ned",
  "charles charlie chuck chas",
  "david dave davy",
  "samuel sam sammy",
  "samantha sam sammy",
  "patrick pat paddy",
  "patricia pat patty trish tricia",
  "peter pete",
  "timothy tim timmy",
  "gregory greg",
  "kenneth ken kenny",
  "ronald ron ronnie",
  "donald don donnie",
  "lawrence larry laurie",
  "frederick fred freddie",
  "henry harry hank",
  "francis frank frankie",
  "francesca fran frankie chesca",
  "elizabeth liz lizzie beth betty eliza libby",
  "katherine kate katie kathy kat",
  "catherine cath cathy kate katie",
  "margaret maggie meg peggy greta",
  "jennifer jen jenny",
  "rebecca becky becca",
  "susan sue susie",
  "deborah debbie deb",
  "victoria vicky tori",
  "abigail abby",
  "eleanor ellie nora",
  "isabella bella izzy isabel",
  "josephine jo josie",
  "jessica jess jessie",
  "kimberly kim",
  "pamela pam",
  "theresa tess tessa terri",
  "dorothy dot dottie",
  "barbara barb babs",
  "judith judy",
  "nathaniel nate nat",
  "zachary zach zack",
  "joshua josh",
  "gabriel gabe",
  "raymond ray",
  "vincent vince vinny",
  "philip phil pip",
  "douglas doug",
  "geoffrey geoff jeff",
  "jeffrey jeff",
  "leonard leo len lenny",
  "arthur art artie",
  "albert al bert",
  "alfred alf alfie fred",
  "harold harry hal",
  "oliver ollie",
  "sebastian seb",
  "tobias toby",
  "maximilian max",
  "johannes hans jan johann",
  "wolfgang wolf",
  "giuseppe beppe peppe",
  "francisco paco pancho",
  "jose pepe",
  "guillermo memo",
  "manuel manolo",
  "dolores lola",
  "aleksander olek",
  "malgorzata gosia",
  "katarzyna kasia",
  "wojciech wojtek",
];

const INDEX = new Map<string, Set<number>>();
GROUPS.forEach((g, i) => {
  for (const n of g.split(" ")) {
    if (!INDEX.has(n)) INDEX.set(n, new Set());
    INDEX.get(n)!.add(i);
  }
});

/** True when two folded first names appear in the same variant group (Robert/Bob, Elizabeth/Liz). */
export function nicknameMatch(a: string, b: string): boolean {
  if (!a || !b || a === b) return false;
  const ga = INDEX.get(a);
  const gb = INDEX.get(b);
  if (!ga || !gb) return false;
  for (const g of ga) if (gb.has(g)) return true;
  return false;
}

/** Every name that shares a variant group with `a` (Bob → robert, bobby, rob, …). */
const variantCache = new Map<string, string[]>();
export function nicknameVariants(a: string): string[] {
  const g = INDEX.get(a);
  if (!g) return [];
  let hit = variantCache.get(a);
  if (!hit) {
    const out = new Set<string>();
    for (const i of g) for (const n of GROUPS[i].split(" ")) if (n !== a) out.add(n);
    variantCache.set(a, (hit = [...out]));
  }
  return hit;
}

/** A stable key for blocking: the first group's canonical name, or the name itself. */
export function nicknameRoot(a: string): string {
  const g = INDEX.get(a);
  if (!g) return a;
  return GROUPS[Math.min(...g)].split(" ")[0];
}
