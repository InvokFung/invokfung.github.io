// Name, place and company pools for the synthetic customers. Company names
// are coined words; the people are random combinations of common given and
// family names. Email domains use the reserved .example TLD.

export const COUNTRIES = ["GB", "US", "DE", "FR", "NL", "ES", "IE", "SE"] as const;
export type Country = (typeof COUNTRIES)[number];
export const COUNTRY_WEIGHTS = [30, 18, 15, 12, 9, 7, 5, 4];

export const CURRENCY: Record<Country, string> = { GB: "GBP", US: "USD", DE: "EUR", FR: "EUR", NL: "EUR", ES: "EUR", IE: "EUR", SE: "SEK" };

export const FIRST: Record<Country, string[]> = {
  GB: ["Oliver", "Amelia", "James", "Isla", "William", "Elizabeth", "Thomas", "Margaret", "Robert", "Katherine", "Jonathan", "Rebecca", "Edward", "Victoria", "Samuel", "Charlotte", "Richard", "Eleanor", "Christopher", "Harriet", "Daniel", "Imogen", "Matthew", "Freya", "Benjamin", "Poppy", "Andrew", "Lucy", "Nicholas", "Phoebe", "Alexander", "Grace", "Theodore", "Rosie", "Frederick", "Hannah"],
  US: ["Michael", "Jennifer", "Robert", "Patricia", "Christopher", "Jessica", "Joseph", "Ashley", "Anthony", "Megan", "Daniel", "Lauren", "Matthew", "Brittany", "Joshua", "Kimberly", "Andrew", "Samantha", "William", "Elizabeth", "Tyler", "Madison", "Brandon", "Hailey", "Jacob", "Abigail", "Ethan", "Chloe", "Nathaniel", "Zoë"],
  DE: ["Lukas", "Anna", "Jürgen", "Sabine", "Maximilian", "Katarina", "Johannes", "Ursula", "Wolfgang", "Jörg", "Mia", "Felix", "Lena", "Jonas", "Hannah", "Björn", "Sophie", "Matthias", "Lea", "Tobias", "Käthe", "Moritz", "Greta", "Florian", "Annika"],
  FR: ["Lucas", "Chloé", "Hugo", "Léa", "Louis", "Inès", "Raphaël", "Anaïs", "Théo", "Noémie", "François", "Hélène", "René", "Agnès", "Mathis", "Camille", "Joël", "Élodie", "Antoine", "Margaux", "Clément", "Océane"],
  NL: ["Daan", "Sanne", "Pieter", "Fleur", "Bram", "Femke", "Joost", "Lotte", "Sem", "Anouk", "Thijs", "Eva", "Jesse", "Noor", "Ruben", "Marieke", "Wouter", "Iris"],
  ES: ["José", "María", "Lucía", "Mateo", "Pablo", "Núria", "Javier", "Mónica", "Diego", "Sofía", "Álvaro", "Inés", "Francisco", "Dolores", "Andrés", "Carmen", "Íñigo"],
  IE: ["Seán", "Aoife", "Ciarán", "Niamh", "Conor", "Siobhán", "Eoin", "Róisín", "Liam", "Saoirse", "Patrick", "Orla", "Darragh", "Clodagh"],
  SE: ["Søren", "Åsa", "Lars", "Ingrid", "Björn", "Märta", "Erik", "Elin", "Håkan", "Linnéa", "Oskar", "Maja", "Anders", "Sofie", "Gustav"],
};

export const LAST: Record<Country, string[]> = {
  GB: ["Ashworth", "Pembridge", "Whitlock", "Hollis", "Carver", "Thornbury", "Fairley", "Okafor", "Patel", "Hughes", "Blackwood", "Rowntree", "Kendrick", "Lockhart", "Sinclair", "Marlowe", "Hargreaves", "Ellery", "Brennan", "Chowdhury", "Fenwick", "Gallagher", "Haddon", "Iqbal", "Jessop", "Kingsley", "Langford", "Mercer", "Nightingale", "O'Neill", "Prescott", "Quinlan", "Radcliffe", "Stanhope", "Tennant", "Underwood", "Varley", "Wainwright", "Yardley", "McAllister"],
  US: ["Delgado", "Whitaker", "Brooks", "Nguyen", "Ramirez", "Calloway", "Henderson", "Okonkwo", "Fitzgerald", "Kowalski", "Lindgren", "Montoya", "Pruitt", "Rasmussen", "Sorensen", "Tillman", "Vasquez", "Winslow", "Abernathy", "Bancroft", "Castellano", "Donovan", "Easterly", "Fairbanks", "Gutierrez", "Holloway", "Ingram", "Jefferies", "Kaplan", "McCready"],
  DE: ["Müller", "Schröder", "Becker", "Hoffmann", "Krüger", "Wagner", "Böhm", "Fischer", "Lehmann", "Schäfer", "Köhler", "Neumann", "Zimmermann", "Brandt", "Vogt", "Weiß", "Lorenz", "Haas", "Jäger", "Engel"],
  FR: ["Lefèvre", "Moreau", "Girard", "Rousseau", "Fontaine", "Chevalier", "Lambert", "Bonnet", "Dupré", "Mercier", "Gauthier", "Perrin", "Roussel", "Faure", "Lemoine", "Barbier", "Ménard", "Caron"],
  NL: ["de Vries", "van Dijk", "Bakker", "Visser", "Smit", "Meijer", "de Boer", "Mulder", "Bos", "Vos", "Peters", "Hendriks", "van Leeuwen", "Dekker", "Brouwer", "de Wit"],
  ES: ["García", "Fernández", "López", "Martínez", "Sánchez", "Pérez", "Gómez", "Ruiz", "Díaz", "Moreno", "Muñoz", "Álvarez", "Romero", "Navarro", "Torres", "Domínguez"],
  IE: ["Ó Briain", "Murphy", "Kelly", "Byrne", "Ryan", "O'Sullivan", "Walsh", "McCarthy", "Doyle", "Kavanagh", "Brennan", "Fitzpatrick", "Lynch", "Nolan"],
  SE: ["Lindqvist", "Johansson", "Andersson", "Karlsson", "Nilsson", "Ström", "Lundgren", "Bergström", "Åkesson", "Sjöberg", "Holmgren", "Wikström"],
};

/** Morphemes for invented family names (Pemworth, Lindqvarn, Falkenbrunn); most people get one of these, a minority a common surname from LAST. */
export const SURNAME_PARTS: Record<Country, { pre: string[]; post: string[]; particles?: string[] }> = {
  GB: {
    pre: ["Ash", "Black", "Brad", "Brook", "Cal", "Craw", "Dun", "Elling", "Fair", "Hal", "Hart", "Hol", "Kings", "Lang", "Mar", "Nor", "Pem", "Rad", "Rams", "Shel", "Stan", "Thorn", "Whit", "Wood", "Aber", "Bel", "Car", "Dal", "Fen", "Gold", "Hay", "Kel", "Lin", "Mel", "New", "Pen", "Ros", "Sal", "Tal", "Wen"],
    post: ["worth", "bridge", "ford", "ley", "ton", "field", "wood", "by", "combe", "hurst", "more", "well", "dale", "ham", "shaw", "wick", "stead", "brook", "cliffe", "lock"],
  },
  US: {
    pre: ["Ash", "Brad", "Cal", "Dun", "Fair", "Hart", "Kings", "Lang", "Mar", "Nor", "Shel", "Stan", "Whit", "Car", "Gold", "Mel", "New", "Pen", "Hollen", "Ober", "Ridge", "Silver", "Wester"],
    post: ["worth", "field", "ton", "ley", "wood", "berg", "man", "dale", "ham", "ridge", "stone", "well", "brook", "son", "baker", "ford", "lock", "quist"],
  },
  DE: {
    pre: ["Alt", "Berg", "Brand", "Eisen", "Falken", "Gold", "Grün", "Hoch", "Kirch", "Lang", "Linden", "Mühl", "Neu", "Ober", "Rosen", "Schön", "Stein", "Wald", "Weiß", "Winter", "Sonnen", "Kalt", "Hart", "Holz"],
    post: ["mann", "berg", "feld", "hof", "bach", "stein", "haus", "meier", "brunn", "thal", "wald", "egger", "inger", "ner", "hauser", "müller", "kötter", "bauer"],
  },
  FR: {
    pre: ["Beau", "Bel", "Bon", "Châte", "Clair", "Dé", "Font", "Grand", "Lam", "Mar", "Mont", "Ro", "Val", "Ver", "Bros", "Cha", "Che", "Du", "Lé", "Mé"],
    post: ["mont", "champ", "ville", "val", "fort", "lieu", "bois", "pré", "court", "rive", "sart", "mare", "nier", "vin", "roux", "lard", "rand", "zac"],
  },
  NL: {
    pre: ["Berg", "Bosch", "Brink", "Dijk", "Haar", "Heuvel", "Hoek", "Kamp", "Laar", "Meer", "Molen", "Veen", "Velde", "Wal", "Zand", "Broek", "Hout", "Kerk"],
    post: ["", "", "man", "huis", "ink", "ing", "stra", "sma", "ma", "kamp"],
    particles: ["van den ", "van der ", "de ", "van ", "", "", "", ""],
  },
  ES: {
    pre: ["Gar", "Fer", "Mar", "Ló", "Ro", "San", "Gó", "Ál", "Na", "Ra", "Ve", "Do", "Bel", "Cas", "Pe", "Ur"],
    post: ["cía", "nández", "tínez", "pez", "dríguez", "chez", "mez", "varez", "varro", "mírez", "lázquez", "mínguez", "tero", "rrano", "dal", "quijo"],
  },
  IE: {
    pre: ["Dar", "Fenn", "Gar", "Kerr", "Lan", "Mor", "Nol", "Quin", "Rour", "Sull", "Tier", "Bren", "Callag", "Dono", "Fland", "Kenn", "Mull", "Cass"],
    post: ["an", "ey", "agh", "ane", "ell", "ihy", "ery", "on", "igan", "ahy"],
    particles: ["O'", "Mc", "Mac", "", "", ""],
  },
  SE: {
    pre: ["Berg", "Lind", "Sjö", "Ström", "Ny", "Ek", "Holm", "Lund", "Sand", "Dahl", "Ås", "Björk", "Gran", "Häll", "Ahl", "Malm", "Fors", "Hed"],
    post: ["qvist", "ström", "berg", "gren", "lund", "dahl", "man", "holm", "by", "kvist", "hed", "blad", "vall", "näs"],
  },
};

/** The generator's own nickname table. It deliberately differs from the matcher's in places. */
export const NICKNAMES: Record<string, string[]> = {
  Robert: ["Bob", "Rob", "Bobby"],
  William: ["Bill", "Will"],
  Elizabeth: ["Liz", "Beth", "Eliza"],
  Katherine: ["Kate", "Katie", "Kathy"],
  Margaret: ["Maggie", "Meg", "Peggy"],
  James: ["Jim", "Jamie"],
  Michael: ["Mike", "Mick"],
  Thomas: ["Tom", "Tommy"],
  Alexander: ["Alex", "Sasha"],
  Jennifer: ["Jen", "Jenny"],
  Christopher: ["Chris", "Kit"],
  Daniel: ["Dan", "Danny"],
  Richard: ["Rick", "Rich"],
  Jonathan: ["Jon", "Jonny"],
  Rebecca: ["Becky", "Bex"],
  Samuel: ["Sam"],
  Samantha: ["Sam", "Sammy"],
  Benjamin: ["Ben"],
  Nicholas: ["Nick", "Nico"],
  Edward: ["Ed", "Ted", "Eddie"],
  Victoria: ["Vicky", "Tori"],
  Matthew: ["Matt"],
  Andrew: ["Andy", "Drew"],
  Joseph: ["Joe"],
  Anthony: ["Tony", "Ant"],
  Patricia: ["Patty", "Trish"],
  Johannes: ["Hans"],
  Francisco: ["Paco"],
  Dolores: ["Lola"],
  Wolfgang: ["Wolf"],
  Theodore: ["Theo", "Ted"],
  Frederick: ["Fred", "Freddie"],
  Nathaniel: ["Nate", "Nat"],
  Joshua: ["Josh"],
  Abigail: ["Abby"],
  Eleanor: ["Ellie", "Nora"],
  Maximilian: ["Max"],
  Jessica: ["Jess"],
  Kimberly: ["Kim"],
  Patrick: ["Paddy", "Pat"],
  Tobias: ["Toby"],
};

export interface CountryPlaces {
  cities: { name: string; area: string }[];
  streets: string[];
  /** English-style kinds that can be abbreviated, or a suffix style. */
  kinds: string[];
  order: "number-first" | "number-last";
}

export const PLACES: Record<Country, CountryPlaces> = {
  GB: {
    cities: [{ name: "London", area: "20" }, { name: "Manchester", area: "161" }, { name: "Leeds", area: "113" }, { name: "Bristol", area: "117" }, { name: "Glasgow", area: "141" }, { name: "Edinburgh", area: "131" }, { name: "Birmingham", area: "121" }, { name: "Norwich", area: "1603" }, { name: "York", area: "1904" }, { name: "Brighton", area: "1273" }, { name: "Cardiff", area: "29" }],
    streets: ["High", "Station", "Mill", "Church", "Victoria", "Park", "Larkhill", "Quarry", "Orchard", "Willow", "Granary", "Tanner", "Rope Walk", "Abbey", "Kiln", "Foundry"],
    kinds: ["Street", "Road", "Lane", "Avenue", "Close", "Drive"],
    order: "number-first",
  },
  US: {
    cities: [{ name: "Portland", area: "503" }, { name: "Denver", area: "303" }, { name: "Austin", area: "512" }, { name: "Columbus", area: "614" }, { name: "Raleigh", area: "919" }, { name: "Madison", area: "608" }, { name: "Boise", area: "208" }, { name: "Tucson", area: "520" }, { name: "Omaha", area: "402" }, { name: "Savannah", area: "912" }],
    streets: ["Maple", "Oak", "Cedar", "Lakeview", "Hillcrest", "Sunset", "Ridge", "Meadow", "Juniper", "Harbor", "Canyon", "Prairie", "Birch", "Elm"],
    kinds: ["Street", "Avenue", "Drive", "Road", "Lane", "Boulevard"],
    order: "number-first",
  },
  DE: {
    cities: [{ name: "Berlin", area: "30" }, { name: "Hamburg", area: "40" }, { name: "München", area: "89" }, { name: "Köln", area: "221" }, { name: "Leipzig", area: "341" }, { name: "Dresden", area: "351" }, { name: "Stuttgart", area: "711" }, { name: "Bremen", area: "421" }],
    streets: ["Linden", "Garten", "Bahnhof", "Schiller", "Birken", "Mühlen", "Kirch", "Wald", "Rosen", "Ahorn", "Brunnen", "Feld"],
    kinds: ["straße", "weg", "allee"],
    order: "number-last",
  },
  FR: {
    cities: [{ name: "Paris", area: "1" }, { name: "Lyon", area: "4" }, { name: "Lille", area: "3" }, { name: "Nantes", area: "2" }, { name: "Bordeaux", area: "5" }, { name: "Toulouse", area: "5" }, { name: "Rennes", area: "2" }, { name: "Grenoble", area: "4" }],
    streets: ["rue des Lilas", "rue du Moulin", "avenue des Tilleuls", "rue de la Gare", "boulevard des Platanes", "rue des Écoles", "allée des Cerisiers", "rue du Port", "chemin des Vignes", "place du Marché"],
    kinds: [""],
    order: "number-first",
  },
  NL: {
    cities: [{ name: "Amsterdam", area: "20" }, { name: "Utrecht", area: "30" }, { name: "Rotterdam", area: "10" }, { name: "Den Haag", area: "70" }, { name: "Eindhoven", area: "40" }, { name: "Groningen", area: "50" }],
    streets: ["Kerk", "Molen", "Dorps", "School", "Linden", "Wilgen", "Prinsen", "Haven", "Beuken", "Tulpen"],
    kinds: ["straat", "weg", "laan", "gracht"],
    order: "number-last",
  },
  ES: {
    cities: [{ name: "Madrid", area: "91" }, { name: "Barcelona", area: "93" }, { name: "Valencia", area: "96" }, { name: "Sevilla", area: "95" }, { name: "Bilbao", area: "94" }, { name: "Málaga", area: "95" }],
    streets: ["Calle Mayor", "Calle del Sol", "Avenida de la Paz", "Calle de las Flores", "Paseo del Río", "Calle Nueva", "Plaza del Carmen", "Calle Real"],
    kinds: [""],
    order: "number-last",
  },
  IE: {
    cities: [{ name: "Dublin", area: "1" }, { name: "Cork", area: "21" }, { name: "Galway", area: "91" }, { name: "Limerick", area: "61" }],
    streets: ["Harbour", "Chapel", "Bridge", "Strand", "Castle", "Main", "Abbey", "Mill"],
    kinds: ["Street", "Road", "Lane", "Terrace"],
    order: "number-first",
  },
  SE: {
    cities: [{ name: "Stockholm", area: "8" }, { name: "Göteborg", area: "31" }, { name: "Malmö", area: "40" }, { name: "Uppsala", area: "18" }],
    streets: ["Stor", "Kyrko", "Skol", "Drottning", "Hamn", "Kvarn", "Björk", "Sjö"],
    kinds: ["gatan", "vägen", "gränd"],
    order: "number-last",
  },
};

export const COUNTRY_SPELLINGS: Record<Country, string[]> = {
  GB: ["United Kingdom", "UK", "GB", "Great Britain", "England", "U.K."],
  US: ["United States", "USA", "US", "U.S.A.", "United States of America"],
  DE: ["Germany", "Deutschland", "DE", "GERMANY"],
  FR: ["France", "FR", "FRANCE"],
  NL: ["Netherlands", "The Netherlands", "Holland", "NL", "Nederland"],
  ES: ["Spain", "España", "ES", "Espana"],
  IE: ["Ireland", "IE", "Eire", "Republic of Ireland"],
  SE: ["Sweden", "Sverige", "SE"],
};

/** Coined words for company names; none is meant to be a real brand. */
export const COINED = [
  "Quillmere", "Tarrowby", "Velloran", "Brindlecombe", "Ostrelle", "Kessivane", "Harrowmede", "Lumbrook", "Calvorne", "Dravenhill",
  "Merrowby", "Ashkettle", "Corrandel", "Pellowin", "Thistlebury", "Wexmere", "Halvarde", "Oskenby", "Brackwyn", "Ferrowind",
  "Lanthorne", "Ondrell", "Sarnoway", "Telvane", "Umberlee", "Vossberg", "Wrenquill", "Yarrowdale", "Zellcourt", "Argentoft",
  "Bellmarsh", "Cinderwell", "Dunmorrow", "Emberlin", "Falcombe", "Glimmerholt", "Hollowtide", "Ivenhurst", "Juniperra", "Kestrova",
  "Larkspen", "Mistlebrook", "Norrowind", "Orchellan", "Pinnacombe", "Quarrelton", "Rookwell", "Saltrove", "Tindermoor", "Vantrelle",
];

export const INDUSTRY = [
  "Logistics", "Analytics", "Dental", "Bakery", "Freight", "Textiles", "Instruments", "Software", "Studio", "Partners", "Joinery", "Engineering",
  "Labs", "Consulting", "Foods", "Brewing", "Ceramics", "Robotics", "Optics", "Print Works", "Architects", "Outfitters", "Marine", "Energy",
  "Media", "Health", "Systems", "Interiors", "Supply", "Garden Co",
];

/** Legal-form suffixes per country, with the variants people actually type. */
export const LEGAL: Record<Country, string[][]> = {
  GB: [["Ltd", "Limited", "Ltd.", "LTD"], ["PLC", "plc"]],
  US: [["LLC", "L.L.C.", "llc"], ["Inc.", "Inc", "Incorporated"], ["Corp.", "Corporation"]],
  DE: [["GmbH", "Gmbh", "GMBH"], ["AG"]],
  FR: [["SAS", "S.A.S."], ["SARL", "S.A.R.L."]],
  NL: [["B.V.", "BV", "B.V"]],
  ES: [["S.L.", "SL"], ["S.A.", "SA"]],
  IE: [["Ltd", "Limited", "Ltd."], ["DAC"]],
  SE: [["AB", "Aktiebolag"]],
};

export const MAIL_PROVIDERS = ["mailbox.example", "postbox.example", "inboxly.example", "letterpost.example", "quickpost.example", "webpost.example"];

export const STAFF = ["A. Lindqvist", "J. Okafor", "M. Brandt", "S. Moreau", "R. Delgado", "K. Visser", "T. Ashworth", "unassigned"];
export const LEAD_SOURCES = ["Webinar", "Referral", "Trade show", "Website", "Partner", "Cold call", "Event"];
export const PLANS = ["Starter", "Team", "Pro", "Enterprise"];
export const TAGS = ["vip", "net30", "eu", "legacy", "annual", "reseller", "tax-exempt"];
