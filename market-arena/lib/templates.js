// Starting points for Practice mode. Each is a self-contained market: a scenario
// brief, a persona list (segments come from the persona list, same as scenario.js),
// and a couple of default brands. Users can edit every field before running a round.
import { SCENARIO, PERSONAS, DEFAULT_TEAMS } from "./scenario.js";

export const TEMPLATES = [
  {
    id: "cpg-coffee",
    industry: "CPG / Beverage",
    scenario: SCENARIO,
    personas: PERSONAS,
    defaultTeams: DEFAULT_TEAMS,
  },
  {
    id: "saas-projectflow",
    industry: "SaaS / B2B software",
    scenario: {
      id: "saas-projectflow",
      title: "A project tool enters a crowded market",
      brief: "Every team already has three project tools they don't fully use. Twelve buyers across four segments will see every pitch side by side and decide what, if anything, they'd adopt.",
    },
    personas: [
      { id: "s1", name: "Jordan", segment: "Startup operators", profile: "29, ops lead at a 15-person startup in Austin, juggles six tools daily, wants one thing that replaces three, decides fast without procurement" },
      { id: "s2", name: "Priya", segment: "Startup operators", profile: "26, co-founder of a seed-stage fintech in Bengaluru, price-sensitive until Series A, evaluates via free trial rather than sales calls" },
      { id: "s3", name: "Mateo", segment: "Startup operators", profile: "33, growth marketer in Lisbon, hates onboarding friction, will churn within a week if setup takes longer than ten minutes" },
      { id: "s4", name: "Diane", segment: "Enterprise IT buyers", profile: "47, IT director at a 3000-person insurer in Chicago, requires SSO and SOC2 before even a demo, procurement cycle is six months" },
      { id: "s5", name: "Kenji", segment: "Enterprise IT buyers", profile: "52, CTO at a manufacturing firm in Osaka, deeply risk-averse, wants references from similarly-sized companies" },
      { id: "s6", name: "Anna", segment: "Enterprise IT buyers", profile: "38, security lead at a European bank, blocks any vendor without a clear data-residency guarantee" },
      { id: "s7", name: "Sam", segment: "Freelancers & solopreneurs", profile: "31, freelance designer in Toronto, pays out of pocket, cancels any subscription unused for a month, wants dead-simple pricing" },
      { id: "s8", name: "Fatima", segment: "Freelancers & solopreneurs", profile: "27, independent consultant in Dubai, manages eight clients at once, needs something that works as well on her phone as her laptop" },
      { id: "s9", name: "Leo", segment: "Freelancers & solopreneurs", profile: "24, indie app developer in Berlin, allergic to per-seat pricing since he's a team of one" },
      { id: "s10", name: "Grace", segment: "Team leads at mid-size companies", profile: "41, engineering manager at a 200-person company in Sydney, evaluates tools with her team before buying, hates being sold to" },
      { id: "s11", name: "Omar", segment: "Team leads at mid-size companies", profile: "36, marketing director in Cairo, already has a tool the team likes, needs a real reason to switch" },
      { id: "s12", name: "Wei", segment: "Team leads at mid-size companies", profile: "44, ops director in Singapore, burned by a failed rollout last year, wants proof of a smooth migration" },
    ],
    defaultTeams: [
      { brand: "FlowStack", headline: "Every project, one screen.", valueProp: "All-in-one project tracking with built-in chat and file storage. No plugins, no per-seat surprises.", price: "$12/user/month" },
      { brand: "TaskNest", headline: "Simple enough for solo founders.", valueProp: "Lightweight task boards that scale from one person to a hundred. Free for teams under five.", price: "$9/user/month" },
    ],
  },
  {
    id: "retail-dtc",
    industry: "Retail / DTC fashion",
    scenario: {
      id: "retail-dtc",
      title: "A new label launches into a saturated feed",
      brief: "Everyone's timeline is already full of new clothing brands. Twelve shoppers across four segments will see every ad side by side and decide what, if anything, they'd buy.",
    },
    personas: [
      { id: "r1", name: "Zoe", segment: "Trend-forward Gen Z", profile: "19, college student in LA, discovers brands on TikTok, buys on impulse if it looks good on camera, returns anything that doesn't" },
      { id: "r2", name: "Malik", segment: "Trend-forward Gen Z", profile: "21, streetwear collector in Atlanta, follows drop culture, will pay more for limited releases, skeptical of brands that feel try-hard" },
      { id: "r3", name: "Yuki", segment: "Trend-forward Gen Z", profile: "18, high schooler in Tokyo, budget from a part-time job, influenced heavily by reviews and unboxing videos" },
      { id: "r4", name: "Carla", segment: "Value-conscious parents", profile: "39, mother of three in Sao Paulo, buys in bulk during sales, needs durability over style, compares price per wear" },
      { id: "r5", name: "Ben", segment: "Value-conscious parents", profile: "42, father in Manchester, shops mostly for his kids, wants easy returns and a real size guide" },
      { id: "r6", name: "Ritu", segment: "Value-conscious parents", profile: "35, working mother in Pune, shops late at night on her phone, abandons carts over unexpected shipping fees" },
      { id: "r7", name: "Hannah", segment: "Loyal repeat shoppers", profile: "29, teacher in Denver, has bought from the same three brands for years, needs a strong reason to try something new" },
      { id: "r8", name: "Tomas", segment: "Loyal repeat shoppers", profile: "34, wardrobe built around one aesthetic, buys the same items in every colour, hates seasonal redesigns" },
      { id: "r9", name: "Aisha", segment: "Loyal repeat shoppers", profile: "45, nurse in Lagos, values consistent fit above all else since she orders without trying on" },
      { id: "r10", name: "Grace", segment: "Occasion & gift shoppers", profile: "50, buys clothing mainly as gifts for family, wants nice packaging and easy exchanges" },
      { id: "r11", name: "Diego", segment: "Occasion & gift shoppers", profile: "27, shops once or twice a year for weddings and events, wants something that photographs well" },
      { id: "r12", name: "Nadia", segment: "Occasion & gift shoppers", profile: "33, buys for her partner's birthday, relies entirely on reviews since she can't ask him what he wants" },
    ],
    defaultTeams: [
      { brand: "Wearhouse", headline: "Built for how you actually move.", valueProp: "Everyday streetwear made from recycled performance fabric. Free returns, always.", price: "$48 per piece" },
      { brand: "Fieldnote", headline: "Fewer, better clothes.", valueProp: "Classic staples designed to last five years, not five washes.", price: "$65 per piece" },
    ],
  },
  {
    id: "fintech-app",
    industry: "Fintech / consumer finance",
    scenario: {
      id: "fintech-app",
      title: "A finance app tries to earn trust with money",
      brief: "Money is the one category people don't experiment with casually. Twelve users across four segments will see every pitch side by side and decide what, if anything, they'd trust with their finances.",
    },
    personas: [
      { id: "f1", name: "Ethan", segment: "First-time investors", profile: "23, junior analyst in New York, has never invested before, intimidated by jargon, wants something that explains itself" },
      { id: "f2", name: "Ana", segment: "First-time investors", profile: "25, teacher in Mexico City, invests small amounts monthly, deeply worried about losing money she can't afford to lose" },
      { id: "f3", name: "Ravi", segment: "First-time investors", profile: "22, recent graduate in Bengaluru, learned about investing from YouTube, wants low minimums and gamified progress" },
      { id: "f4", name: "Monica", segment: "Debt-conscious savers", profile: "31, nurse in Manila, paying off student loans, prioritizes debt payoff tools over investing features" },
      { id: "f5", name: "Kwame", segment: "Debt-conscious savers", profile: "29, teacher in Accra, lives paycheck to paycheck, needs brutally simple budgeting, distrusts hidden fees" },
      { id: "f6", name: "Sara", segment: "Debt-conscious savers", profile: "34, single mother in Glasgow, has been burned by overdraft fees before, wants total transparency on costs" },
      { id: "f7", name: "David", segment: "High earners seeking growth", profile: "45, surgeon in Melbourne, has money to invest but no time to manage it, wants automation over control" },
      { id: "f8", name: "Linh", segment: "High earners seeking growth", profile: "38, tech executive in Ho Chi Minh City, already has a broker, needs a clear reason to add another app" },
      { id: "f9", name: "Peter", segment: "High earners seeking growth", profile: "50, business owner in Amsterdam, cares most about tax efficiency and long-term planning tools" },
      { id: "f10", name: "Margaret", segment: "Skeptical traditionalists", profile: "58, retired accountant in Edinburgh, trusts her bank branch more than any app, deeply wary of fintech startups" },
      { id: "f11", name: "Harold", segment: "Skeptical traditionalists", profile: "63, former banker in Boston, reads every line of the terms of service, assumes any new app is trying to hide something" },
      { id: "f12", name: "Chen", segment: "Skeptical traditionalists", profile: "55, small business owner in Taipei, had a bad experience with a fintech collapse, needs strong proof of security and regulation" },
    ],
    defaultTeams: [
      { brand: "Sprout", headline: "Investing that explains itself.", valueProp: "Start with $5. Every recommendation comes with a plain-English reason.", price: "Free, $3/month after $1,000 invested" },
      { brand: "Ledgerly", headline: "See where your money actually goes.", valueProp: "Automatic budgeting with real human support, not just a chatbot.", price: "$6.99/month" },
    ],
  },
  {
    id: "blank",
    industry: "Start from scratch",
    scenario: { id: "blank", title: "Describe your own market", brief: "Rename the segments, rewrite the customers, and describe the product you're actually testing." },
    personas: [
      { id: "b1", name: "Customer 1", segment: "Segment A", profile: "Describe who this is: age, role or life stage, what they care about, what they're skeptical of." },
      { id: "b2", name: "Customer 2", segment: "Segment B", profile: "Describe who this is: age, role or life stage, what they care about, what they're skeptical of." },
      { id: "b3", name: "Customer 3", segment: "Segment C", profile: "Describe who this is: age, role or life stage, what they care about, what they're skeptical of." },
      { id: "b4", name: "Customer 4", segment: "Segment D", profile: "Describe who this is: age, role or life stage, what they care about, what they're skeptical of." },
    ],
    defaultTeams: [
      { brand: "Brand A", headline: "", valueProp: "", price: "" },
      { brand: "Brand B", headline: "", valueProp: "", price: "" },
    ],
  },
];

export function findTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}
