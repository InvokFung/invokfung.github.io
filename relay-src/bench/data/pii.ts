// Labelled redaction set. Each sample marks its PII inline as {TYPE:value};
// everything else in the text is not PII. Written after the detectors, to
// measure them, and not edited to make them look better: the hard cases
// (names with no cue, lowercase names, git remotes that look like emails) are
// here on purpose.
//
// All values are fictitious: example.* domains, 555 / Ofcom drama numbers,
// card-network test numbers and the ISO 13616 / bank-documentation example IBANs.

import type { PiiType } from "@relay/core";

export const PII_SAMPLES: string[] = [
  // ---------------------------------------------------------------- email
  "Please send the invoice to {EMAIL:dana.reyes@example.com} by Friday.",
  "My email is {EMAIL:priya.n@example.org}",
  "Contact {EMAIL:billing+refunds@example.co.uk} for refunds.",
  "cc {EMAIL:t.herrera@example.net} and {EMAIL:mei.chen@example.com} on the thread",
  "Reply-To: {EMAIL:support-team@mail.example.io}",
  "email me at {EMAIL:OLIVER.GRANT@EXAMPLE.COM} please",
  "The account owner is {EMAIL:a_okafor@example.de}.",
  "<{EMAIL:lukas.becker@example.de}> wrote: can you check this?",
  "send to {EMAIL:s.kim@example.com}, thanks",
  "Login fails for {EMAIL:j.oneill@sub.example.org} since the update.",
  "Forward the receipt ({EMAIL:receipts@example.com}) to finance.",
  "Is {EMAIL:first.last@example.travel} a valid address for SSO?",
  "Ping {EMAIL:ops@example.dev} if the job fails again",
  "Old address: {EMAIL:mchen1987@example.net}; new address: {EMAIL:mei@example.com}.",
  "My work email {EMAIL:r.patel@example-corp.com} stopped receiving reset links.",
  // ---------------------------------------------------------------- phone
  "Call me on {PHONE:+1 415 555 0132} after 3pm.",
  "My number is {PHONE:(212) 555-0187}.",
  "UK office: {PHONE:+44 20 7946 0958}",
  "Reach the Berlin team at {PHONE:+49 30 901820}.",
  "Paris: {PHONE:+33 1 42 68 53 00}",
  "Tokyo support line {PHONE:+81 3 1234 5678}",
  "text {PHONE:415-555-0199} when you're outside",
  "Please update my phone to {PHONE:+1-202-555-0143}.",
  "You can call {PHONE:020 7946 0321} during office hours.",
  "My mobile is {PHONE:07700 900123}",
  "Fax: {PHONE:+1 (312) 555-0110}",
  "call {PHONE:415.555.0176} or email",
  "The courier rang {PHONE:+61 2 5550 1234} twice.",
  "WhatsApp me on {PHONE:+34 612 345 678}.",
  "My number changed from {PHONE:212 555 0155} to {PHONE:212 555 0168}.",
  "Dial {PHONE:+353 1 555 0199} for the Dublin office",
  "my phone is {PHONE:4155550123}",
  // ---------------------------------------------------------------- card
  "My card {CARD:4111 1111 1111 1111} was declined.",
  "Charge {CARD:5555-5555-5555-4444} instead.",
  "card number {CARD:4242424242424242}, exp 12/29",
  "Amex {CARD:3782 822463 10005} please",
  "Use the Discover card {CARD:6011 1111 1111 1117}.",
  "The refund went to {CARD:5105 1051 0510 5100}?",
  "Visa ending in 1881: {CARD:4012 8888 8888 1881}",
  "Try {CARD:2223 0031 2200 3222} (the new Mastercard).",
  "JCB {CARD:3530 1113 3330 0000} keeps failing",
  "Diners Club {CARD:3056 9309 0259 04} on file",
  "pay with {CARD:4000056655665556}",
  "Card: {CARD:3714 496353 98431}",
  // ---------------------------------------------------------------- IBAN
  "Please pay {IBAN:GB82 WEST 1234 5698 7654 32} this month.",
  "Change my payout account to {IBAN:DE89 3704 0044 0532 0130 00}.",
  "IBAN: {IBAN:FR14 2004 1010 0505 0001 3M02 606}",
  "Send it to {IBAN:NL91ABNA0417164300} please",
  "My IBAN is {IBAN:ES91 2100 0418 4502 0005 1332}.",
  "Account {IBAN:IT60 X054 2811 1010 0000 0123 456} at the Milan branch",
  "Belgian account {IBAN:BE68 5390 0754 7034}",
  "Refund to {IBAN:CH93 0076 2011 6238 5295 7}, thanks.",
  "Use {IBAN:AT611904300234573201} for the Vienna invoices",
  "Irish account: {IBAN:IE29 AIBK 9311 5212 3456 78}",
  "payout to {IBAN:PL61 1090 1014 0000 0712 1981 2874}",
  "Swedish IBAN {IBAN:SE45 5000 0000 0583 9825 7466} for the refund",
  // ---------------------------------------------------------------- name
  "My name is {NAME:Dana Reyes} and I need help.",
  "Hi, I'm {NAME:Priya Natarajan}.",
  "This is {NAME:Tomás Herrera} from accounting.",
  "Dear {NAME:Mei Chen}, your ticket is resolved.",
  "Regards, {NAME:Oliver Grant}",
  "Thanks, {NAME:Amara}",
  "Please ask {NAME:Sarah Kim} to call me back.",
  "{NAME:Lukas Becker} approved the refund yesterday.",
  "Mr. {NAME:Kowalski} has not received the parcel.",
  "Dr. {NAME:Aisha Rahman} is our account owner.",
  "From: {NAME:James O'Neill}",
  "The order was placed by {NAME:Fiona McKay}.",
  "Speak to {NAME:Jean-Luc Martin} about the contract.",
  "I am {NAME:Zoë Saldaña}, the admin for our workspace.",
  "My colleague {NAME:Kenji Watanabe} cannot log in.",
  "Sincerely, {NAME:Ngozi Adeyemi}",
  "Customer: {NAME:Hassan Ali}",
  "Ask for {NAME:Ingrid Larsen} at reception.",
  "my name is {NAME:dana reyes}",
  "Forward this to {NAME:Bartholomew Quist}.",
  "{NAME:Marisol} said the export is broken.",
  "Can {NAME:Wojciech Szczęsny} get access to billing?",
  "Hi team, {NAME:Emily} here: the dashboard is down.",
  "Patient {NAME:Rafael Gómez} missed the appointment.",
  // ---------------------------------------------------------------- mixed
  "I'm {NAME:Sarah Kim}, email {EMAIL:s.kim@example.com}, phone {PHONE:+1 415 555 0132}.",
  "Refund {CARD:4111 1111 1111 1111} or pay {IBAN:GB82 WEST 1234 5698 7654 32}, whichever is faster. {NAME:Dana Reyes}",
  "This is {NAME:Oliver Grant}; reach me at {EMAIL:oliver.grant@example.co.uk} or {PHONE:+44 20 7946 0958}.",
  "Dear {NAME:Priya Natarajan}, we refunded the card ending {CARD:5555 5555 5555 4444}.",
  "Call {PHONE:(212) 555-0187} and ask for {NAME:Mei Chen}.",
  "Payout for {NAME:Lukas Becker}: {IBAN:DE89 3704 0044 0532 0130 00}, receipt to {EMAIL:lukas.becker@example.de}",
  // ---------------------------------------------------------------- not PII
  "Order 415-555-0132 has not shipped.",
  "Invoice number 2024-00042 is overdue.",
  "Released on 2024-03-15 at 10:30 UTC.",
  "Upgrade to version 10.4.22 or later.",
  "The total was $1,234,567.89 for the year.",
  "Our IP range is 192.168.10.0/24.",
  "ISBN 978-0-306-40615-7 is out of stock.",
  "Tracking number 1Z999AA10123456784 shows delivered.",
  "UUID 123e4567-e89b-12d3-a456-426614174000 is duplicated.",
  "Error code 0x80070005 when installing.",
  "We shipped 1,200,000 units in 2023.",
  "Use ports 8080 and 8443 for the proxy.",
  "The card 4111 1111 1111 1112 is a typo in the docs.",
  "Reference 1234 5678 9012 3456 for the wire.",
  "Pay to DE89 3704 0044 0532 0130 01 failed validation.",
  "I'm Sorry for the delay, the export is ready.",
  "Thanks for the quick reply!",
  "Hello World is printed twice.",
  "Dear Customer, your plan renews tomorrow.",
  "We accept Visa and Mastercard.",
  "Clone it with git@github.com:example/relay.git and run npm install.",
  "Connect to user@localhost for the dev database.",
  "Install react@19.3.0 and vite@8.3.2.",
  "Latitude 51.5074, longitude -0.1278.",
  "The meeting is at 14:30 on 03/04/2025.",
  "Ticket #482913 was reopened.",
  "SKU 00012345678905 is discontinued.",
  "My order A-48213 arrived damaged.",
  "Our office is open 9 to 5, Monday to Friday.",
  "The build took 1234 ms on 16 cores.",
  "Microsoft Teams and Google Meet both work.",
  "Set the timeout to 30000 and retries to 3.",
  "Paris and Berlin are both in the EU region.",
  "Account ID 9876543210 needs a reset.",
  "Happy New Year from the whole team!",
  "Product Manager role is open in London.",
  "Go to Settings, then Billing, then Invoices.",
];

export interface Gold {
  type: PiiType;
  start: number;
  end: number;
}

/** Strips the inline markers, returning the plain text and its gold spans. */
export function parseSample(s: string): { text: string; gold: Gold[] } {
  let text = "";
  const gold: Gold[] = [];
  const re = /\{(EMAIL|PHONE|CARD|IBAN|NAME):([^}]+)\}/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    text += s.slice(last, m.index);
    const start = text.length;
    text += m[2];
    gold.push({ type: m[1] as PiiType, start, end: text.length });
    last = m.index! + m[0].length;
  }
  text += s.slice(last);
  return { text, gold };
}
