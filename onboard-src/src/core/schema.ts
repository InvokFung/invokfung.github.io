// The canonical customer schema every source is mapped onto.

export const FIELD_KEYS = [
  "source_id",
  "first_name",
  "last_name",
  "full_name",
  "email",
  "phone",
  "company",
  "street",
  "city",
  "postcode",
  "country",
  "date_of_birth",
  "created_at",
  "updated_at",
  "balance",
  "currency",
  "notes",
] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];

export interface FieldSpec {
  key: FieldKey;
  label: string;
  /** What the column should look like, scored by the profiler. */
  expects: string;
  /** Header vocabulary, as phrases. */
  synonyms: string[];
  /** SQL type for the exported view. */
  sql: string;
  pii?: boolean;
}

export const FIELDS: FieldSpec[] = [
  { key: "source_id", label: "Source ID", expects: "unique identifier", sql: "TEXT", synonyms: ["id", "contact id", "customer id", "account id", "account no", "account number", "requester id", "record id", "client id", "uid", "key", "customer number", "ref"] },
  { key: "first_name", label: "First name", expects: "single capitalised word", sql: "TEXT", pii: true, synonyms: ["first name", "firstname", "given name", "given", "forename", "first", "fname", "christian name"] },
  { key: "last_name", label: "Last name", expects: "single capitalised word", sql: "TEXT", pii: true, synonyms: ["last name", "lastname", "surname", "family name", "family", "last", "lname"] },
  { key: "full_name", label: "Full name", expects: "two or three capitalised words", sql: "TEXT", pii: true, synonyms: ["name", "full name", "contact name", "requester", "requester name", "customer name", "holder name", "client name", "contact", "display name"] },
  { key: "email", label: "Email", expects: "email address", sql: "TEXT", pii: true, synonyms: ["email", "e mail", "email address", "mail", "requester email", "contact email", "e mail address"] },
  { key: "phone", label: "Phone", expects: "phone number", sql: "TEXT", pii: true, synonyms: ["phone", "telephone", "tel", "mobile", "cell", "phone number", "contact number", "mobile phone", "phone no"] },
  { key: "company", label: "Company", expects: "organisation name", sql: "TEXT", synonyms: ["company", "organisation", "organization", "org", "employer", "business", "company name", "account name", "firm"] },
  { key: "street", label: "Street", expects: "number and street", sql: "TEXT", pii: true, synonyms: ["street", "address", "address line 1", "line1", "address1", "street address", "addr", "road"] },
  { key: "city", label: "City", expects: "place name", sql: "TEXT", synonyms: ["city", "town", "locality", "location", "municipality"] },
  { key: "postcode", label: "Postcode", expects: "postal code", sql: "TEXT", synonyms: ["postcode", "post code", "postal code", "zip", "zip code", "zipcode", "plz"] },
  { key: "country", label: "Country", expects: "country name or code", sql: "TEXT", synonyms: ["country", "country code", "nation", "country name"] },
  { key: "date_of_birth", label: "Date of birth", expects: "date, 1930–2010", sql: "DATE", pii: true, synonyms: ["date of birth", "dob", "birthday", "birth date", "born", "birthdate"] },
  { key: "created_at", label: "Customer since", expects: "date, 2000 onwards", sql: "DATE", synonyms: ["created", "created at", "since", "customer since", "first seen", "first contact", "opened", "signup date", "start date", "date created"] },
  { key: "updated_at", label: "Last updated", expects: "recent date", sql: "TIMESTAMP", synonyms: ["updated", "updated at", "last modified", "modified", "last activity", "last updated", "changed", "last seen"] },
  { key: "balance", label: "Balance", expects: "money amount", sql: "NUMERIC(14,2)", synonyms: ["balance", "amount", "annual value", "value", "revenue", "lifetime value", "ltv", "outstanding", "total"] },
  { key: "currency", label: "Currency", expects: "ISO 4217 code", sql: "CHAR(3)", synonyms: ["currency", "ccy", "currency code", "cur"] },
  { key: "notes", label: "Notes", expects: "free text", sql: "TEXT", pii: true, synonyms: ["notes", "note", "comments", "comment", "memo", "description", "remarks", "last note", "details"] },
];

export const FIELD: Record<FieldKey, FieldSpec> = Object.fromEntries(FIELDS.map((f) => [f.key, f])) as Record<FieldKey, FieldSpec>;
