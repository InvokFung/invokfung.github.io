// Labelled replay workload for the response cache.
//
// Each intent is one answer. Its wordings fall into two kinds:
//  - "light": the same words with case, punctuation, filler or a typo changed —
//    what users produce when they ask the same thing again;
//  - "paraphrase": the same question in different words, which a lexical
//    near-duplicate cache is not expected to match.
// Hard negatives are separate intents that differ from another intent by one
// detail that changes the answer (a number, a month, a negation, a swapped
// unit). A hit that returns another intent's answer is a false hit.

export interface CacheIntent {
  id: string;
  light: string[];
  paraphrase: string[];
}

export const CACHE_INTENTS: CacheIntent[] = [
  {
    id: "reset-password",
    light: ["How do I reset my password?", "how do i reset my password", "How do I reset my pasword?", "Quick question: how do I reset my password?", "Hi, how do I reset my password please?"],
    paraphrase: ["I forgot my password, what should I do?", "What are the steps to change a forgotten password?"],
  },
  {
    id: "reset-username",
    light: ["How do I reset my username?", "how do i reset my username"],
    paraphrase: ["Can I change the name I log in with?"],
  },
  {
    id: "cancel-sub",
    light: ["How do I cancel my subscription?", "how do I cancel my subscription", "How can I cancel my subscription?", "How do I cancel my subscripton?"],
    paraphrase: ["I want to stop paying for the plan, how?", "Where do I end my subscription?"],
  },
  {
    id: "cant-cancel-sub",
    light: ["Why can't I cancel my subscription?", "why cant I cancel my subscription"],
    paraphrase: ["The cancel button for my plan does nothing."],
  },
  {
    id: "invoice-march",
    light: ["Send my invoice for March to <EMAIL_1>.", "Please send my invoice for March to <EMAIL_1>.", "send my invoice for march to <EMAIL_1>"],
    paraphrase: ["Could you email me the March invoice at <EMAIL_1>?"],
  },
  {
    id: "invoice-may",
    light: ["Send my invoice for May to <EMAIL_1>.", "please send my invoice for may to <EMAIL_1>"],
    paraphrase: ["I need May's invoice sent to <EMAIL_1>."],
  },
  {
    id: "team-5",
    light: ["Upgrade me to the Team plan with 5 seats.", "Please upgrade me to the Team plan with 5 seats.", "upgrade me to the team plan with 5 seats"],
    paraphrase: ["Move our account to Team, five seats please."],
  },
  {
    id: "team-6",
    light: ["Upgrade me to the Team plan with 6 seats.", "please upgrade me to the team plan with 6 seats"],
    paraphrase: [],
  },
  {
    id: "km-to-mi",
    light: ["Convert 5 km to miles.", "convert 5 km to miles", "Please convert 5 km to miles."],
    paraphrase: ["How many miles is 5 kilometres?"],
  },
  {
    id: "mi-to-km",
    light: ["Convert 5 miles to km.", "convert 5 miles to km"],
    paraphrase: ["How far is 5 miles in kilometres?"],
  },
  {
    id: "errors-429",
    light: ["Why am I getting 429 errors from the API?", "why am i getting 429 errors from the api", "Why am I getting 429 errors from the API? Thanks."],
    paraphrase: ["The API keeps returning 'too many requests', why?"],
  },
  {
    id: "errors-529",
    light: ["Why am I getting 529 errors from the API?", "why am i getting 529 errors from the api"],
    paraphrase: ["What does an overloaded error from the API mean?"],
  },
  {
    id: "delete-account",
    light: ["How do I delete my account and all my data?", "how do I delete my account and all my data", "How do I delete my account and all of my data?"],
    paraphrase: ["Please erase my account and everything you store about me."],
  },
  {
    id: "delete-keep-data",
    light: ["How do I delete my account but keep my data?", "how do I delete my account but keep my data"],
    paraphrase: [],
  },
  {
    id: "export-csv",
    light: ["How do I export my data as CSV?", "how do i export my data as csv", "How can I export my data as a CSV?"],
    paraphrase: ["Is there a way to download everything in a spreadsheet?"],
  },
  {
    id: "export-json",
    light: ["How do I export my data as JSON?", "how do i export my data as json"],
    paraphrase: [],
  },
  {
    id: "refund-order",
    light: ["Hi, I was charged twice for order A-12345. Can I get a refund?", "hi, I was charged twice for order A-12345. can I get a refund?", "Hello, I was charged twice for order A-12345 - can I get a refund please?"],
    paraphrase: ["Order A-12345 billed me two times, please refund one."],
  },
  {
    id: "refund-order-2",
    light: ["Hi, I was charged twice for order A-12346. Can I get a refund?", "hi, I was charged twice for order A-12346. can I get a refund?"],
    paraphrase: [],
  },
  {
    id: "outage",
    light: ["Is there an outage right now? Our requests keep timing out.", "is there an outage right now? our requests keep timing out", "Is there an outage right now? Our requests keep timing out!"],
    paraphrase: ["Are you down? Everything we send times out."],
  },
  {
    id: "two-factor",
    light: ["How do I enable two-factor authentication?", "how do i enable two factor authentication", "How do I turn on two-factor authentication?"],
    paraphrase: ["Can I add 2FA to my login?"],
  },
  {
    id: "two-factor-off",
    light: ["How do I disable two-factor authentication?", "how do i disable two factor authentication"],
    paraphrase: [],
  },
  {
    id: "add-teammate",
    light: ["How do I add a teammate to our workspace?", "how do I add a teammate to our workspace", "How can I add a teammate to our workspace?"],
    paraphrase: ["Inviting a colleague to the workspace: how does it work?"],
  },
  {
    id: "remove-teammate",
    light: ["How do I remove a teammate from our workspace?", "how do I remove a teammate from our workspace"],
    paraphrase: [],
  },
  {
    id: "math-17x23",
    light: ["What is 17 * 23?", "what is 17 * 23", "What is 17*23?"],
    paraphrase: ["Multiply seventeen by twenty-three."],
  },
  {
    id: "math-17x24",
    light: ["What is 17 * 24?", "what is 17 * 24"],
    paraphrase: [],
  },
  {
    id: "sso-loop",
    light: ["Our SSO login loops back to the sign-in page. Any ideas?", "our SSO login loops back to the sign in page, any ideas?"],
    paraphrase: ["Single sign-on keeps redirecting us to the login screen."],
  },
  {
    id: "webhook-secret",
    light: ["Our webhook stopped firing after we rotated the signing secret. What should we check?", "our webhook stopped firing after we rotated the signing secret, what should we check"],
    paraphrase: ["Webhooks broke when we changed the secret."],
  },
  {
    id: "support-hours",
    light: ["What are your support hours?", "what are your support hours", "What are your support hours, please?"],
    paraphrase: ["When can I reach a human on your team?"],
  },
  {
    id: "api-key-rotate",
    light: ["How do I rotate an API key without downtime?", "how do i rotate an api key without downtime", "How do I rotate an API key with no downtime?"],
    paraphrase: ["Changing API keys safely while live, how?"],
  },
  {
    id: "timezone",
    light: ["What timezone are your invoices dated in?", "what timezone are your invoices dated in"],
    paraphrase: [],
  },
];

/** Which intents are hard negatives of which (for reporting). */
export const HARD_NEGATIVES: [string, string][] = [
  ["reset-password", "reset-username"],
  ["cancel-sub", "cant-cancel-sub"],
  ["invoice-march", "invoice-may"],
  ["team-5", "team-6"],
  ["km-to-mi", "mi-to-km"],
  ["errors-429", "errors-529"],
  ["delete-account", "delete-keep-data"],
  ["export-csv", "export-json"],
  ["refund-order", "refund-order-2"],
  ["two-factor", "two-factor-off"],
  ["add-teammate", "remove-teammate"],
  ["math-17x23", "math-17x24"],
];
