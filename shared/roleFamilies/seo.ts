import type { Block, RoleFamily, Variant } from '../types';
import { n, s } from '../variants';
import { AI_ALLOWED_INTRO, AI_ALLOWED_STEPS, pastWorkStage, warmupStage } from './common';

const COMPANIES = [
  {
    company: 'Homecraft',
    product: 'furniture and home decor',
    domain: 'homecraft.example',
    category: 'sofas',
    category2: 'dining-tables',
  },
  {
    company: 'Trailpeak',
    product: 'outdoor and hiking gear',
    domain: 'trailpeak.example',
    category: 'hiking-boots',
    category2: 'tents',
  },
  {
    company: 'Petnest',
    product: 'pet food and supplies',
    domain: 'petnest.example',
    category: 'dog-food',
    category2: 'cat-litter',
  },
] as const;

const PLAYS = [
  { id: 'redirects', label: 'Map every old category URL to its new one with 301 redirects, this sprint' },
  { id: 'rollback', label: 'Roll the URL structure back to /category/' },
  { id: 'content', label: 'Rewrite category page copy for the core update' },
  { id: 'links', label: 'Fund a link-building campaign to category pages' },
];

/** Page-type rows in the brief, with session keys and how each changed. */
const PAGE_TYPES = [
  { key: 'cat', label: 'Category pages' },
  { key: 'prod', label: 'Product pages' },
  { key: 'blog', label: 'Blog and guides' },
  { key: 'home', label: 'Home page' },
] as const;

function signedPct(after: number, before: number) {
  const pct = Math.round(((after - before) / Math.max(before, 1)) * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

const url = (v: Variant, prefix: string, slug: string) => `${s(v, 'domain')}/${prefix}/${s(v, slug)}`;

export const seo: RoleFamily = {
  id: 'seo',
  version: 1,
  name: 'SEO',
  roles: ['SEO Manager', 'SEO Specialist', 'Organic Growth Lead'],
  summary:
    'An organic revenue drop after a site migration, with a Google core update as a red herring, a recovery plan, and an agency audit that would make things worse.',

  warmups: [
    'What is an SEO belief you held a few years ago that you no longer hold? What changed your mind?',
    'How do you explain to a non-marketer what SEO actually does?',
    'What is one SEO tool or report you check first when traffic drops, and why?',
  ],

  generate(rng, currency) {
    const inr = currency === 'INR';
    const co = rng.pick(COMPANIES);
    const catBefore = rng.int(80, 200) * 1000;
    const prodBefore = rng.int(60, 150) * 1000;
    const blogBefore = rng.int(30, 80) * 1000;
    const homeBefore = rng.int(20, 40) * 1000;
    const catDropPct = rng.int(55, 70);
    const prodDropPct = rng.int(4, 10);
    const blogChangePct = rng.int(-3, 3);
    const homeChangePct = rng.int(-2, 4);
    // Category pages are the main organic landing pages, so they carry most of the revenue.
    const catRevenueSharePct = rng.int(55, 65);
    const revenueBefore = inr ? rng.int(60, 140) * 100_000 : rng.int(80, 200) * 1000;
    const revenueDropPct = Math.round(
      (catRevenueSharePct * catDropPct + (100 - catRevenueSharePct) * prodDropPct) / 100,
    );
    const oldCategoryUrls = rng.int(300, 600);
    const notFound = oldCategoryUrls - rng.int(5, 30);
    const indexedBefore = rng.int(8, 14) * 1000;
    return {
      ...co,
      catBefore,
      catAfter: Math.round(catBefore * (1 - catDropPct / 100)),
      catDropPct,
      prodBefore,
      prodAfter: Math.round(prodBefore * (1 - prodDropPct / 100)),
      prodDropPct,
      blogBefore,
      blogAfter: Math.round(blogBefore * (1 + blogChangePct / 100)),
      blogChangePct,
      homeBefore,
      homeAfter: Math.round(homeBefore * (1 + homeChangePct / 100)),
      homeChangePct,
      catRevenueSharePct,
      revenueBefore,
      revenueAfter: Math.round(revenueBefore * (1 - revenueDropPct / 100)),
      revenueDropPct,
      oldCategoryUrls,
      notFound,
      indexedBefore,
      indexedAfter: indexedBefore - notFound + rng.int(20, 60),
      competitorChangePct: rng.int(-2, 3),
      // Branch outcomes.
      recoveredPct: rng.int(70, 85),
      mergedUrls: rng.int(30, 60),
      rollbackWeeks: rng.int(3, 5),
      contentPages: rng.int(25, 40),
      notFoundLater: notFound + rng.int(20, 60),
      links: rng.int(25, 45),
      linksBudget: inr ? rng.int(4, 8) * 100_000 : rng.int(6, 12) * 1000,
    };
  },

  brief(ctx) {
    const v = ctx.variant;
    const { fmt } = ctx;
    return [
      {
        type: 'p',
        text: `You've just joined **${s(v, 'company')}**, an online shop for ${s(v, 'product')}, as head of SEO. Six weeks ago the site moved to a new platform. Category URLs changed from \`/category/...\` to \`/c/...\` (for example \`${url(v, 'category', 'category')}\` is now \`${url(v, 'c', 'category')}\`). The same week, Google announced a core update.`,
      },
      {
        type: 'p',
        text: `Organic revenue is down from ${fmt.money(n(v, 'revenueBefore'))} to **${fmt.money(n(v, 'revenueAfter'))} a month**. The CEO has read about the core update and assumes that is the cause.`,
      },
      {
        type: 'table',
        caption: 'Organic sessions a month, four weeks before vs the last four weeks',
        columns: ['Page type', 'Before', 'After', 'Change'],
        rows: PAGE_TYPES.map(({ key, label }) => [
          label,
          fmt.num(n(v, `${key}Before`)),
          fmt.num(n(v, `${key}After`)),
          signedPct(n(v, `${key}After`), n(v, `${key}Before`)),
        ]),
      },
      { type: 'h', text: 'Other things you have found' },
      {
        type: 'list',
        items: [
          `Before the migration, category pages were the landing page for ${fmt.pct(n(v, 'catRevenueSharePct'))} of organic revenue.`,
          `Search Console: indexed pages went from ${fmt.num(n(v, 'indexedBefore'))} to ${fmt.num(n(v, 'indexedAfter'))}. It reports ${fmt.num(n(v, 'notFound'))} "Not found (404)" URLs, almost all starting with \`/category/\`. The old site had ${fmt.num(n(v, 'oldCategoryUrls'))} category URLs.`,
          'The developer says product URLs were redirected during the migration. Nobody is sure about categories.',
          `An SEO tool shows the visibility of your three closest competitors changed by ${signedPct(100 + n(v, 'competitorChangePct'), 100)} since the core update.`,
        ],
      },
      {
        type: 'callout',
        text: 'The company and numbers are fictional, and every candidate gets a slightly different version. A calculator is fine.',
      },
    ];
  },

  stages: [
    warmupStage(),
    {
      id: 'diagnosis',
      kind: 'scenario',
      title: 'What caused the drop?',
      summary:
        'Diagnose the organic drop and separate the migration from the core update. Think aloud: shows whether they reason from evidence or from the news.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'The CEO asks: **"Is this the Google update, or did we break something?"** What do you think caused the drop, what is your evidence, and what would you check next to be sure?',
        },
        { type: 'p', text: 'Refer to specific numbers. The data is on the left.' },
      ],
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        const { fmt } = ctx;
        return [
          { type: 'p', text: 'Strong answers notice:' },
          {
            type: 'list',
            items: [
              `**The drop is almost all category pages** (down ${fmt.pct(n(v, 'catDropPct'))}), while blog and home pages are flat and products are down only ${fmt.pct(n(v, 'prodDropPct'))}. A core update would rarely hit one URL pattern this precisely.`,
              `**The 404s match the old category URLs** (${fmt.num(n(v, 'notFound'))} of ${fmt.num(n(v, 'oldCategoryUrls'))}): the category URLs were not redirected, so their rankings and links were lost.`,
              '**Competitors are flat**, which also argues against the core update.',
              `**Revenue follows**: category pages carried ${fmt.pct(n(v, 'catRevenueSharePct'))} of organic revenue, which explains a ${fmt.pct(n(v, 'revenueDropPct'))} drop.`,
            ],
          },
          {
            type: 'p',
            text: 'Good next checks: crawl the old category URLs and check their status codes, compare old vs new URLs in Search Console, check the new /c/ pages are indexable (robots, canonicals). Weak answers accept the core-update story or list generic SEO factors.',
          },
        ];
      },
      rubric: [
        {
          id: 'evidence',
          label: 'Reasons from the evidence',
          weight: 2,
          anchors: [
            'Accepts the core-update story or gives generic causes.',
            'Suspects the migration without connecting the numbers.',
            'Ties the drop to category pages and the 404s, with numbers.',
            'Also uses the flat pages and competitors to rule out the core update.',
          ],
        },
        {
          id: 'verification',
          label: 'Knows how to confirm it',
          weight: 1,
          anchors: [
            'No next step.',
            'Generic "run an audit".',
            'Specific checks: crawl old URLs, check status codes and indexing.',
            'Specific checks in order, and what result would change their mind.',
          ],
        },
        {
          id: 'ceo',
          label: 'Clear answer to the CEO',
          weight: 1,
          anchors: [
            'Jargon or no clear answer.',
            'An answer with heavy hedging.',
            'A clear "we broke something, here is what" in plain language.',
            'Clear, plus the size of the problem in revenue and what happens next.',
          ],
        },
      ],
      followUps: (ctx) => [
        `What result would have convinced you it was the core update after all?`,
        `How would you check whether ${url(ctx.variant, 'c', 'category')} can be crawled and indexed?`,
      ],
    },
    {
      id: 'recovery-plan',
      kind: 'decision',
      title: 'The recovery plan',
      summary:
        'Choose the main fix for the next sprint and estimate the recovery. Think aloud: shows prioritisation under engineering constraints.',
      timeLimitSec: 360,
      voiceMaxSec: 150,
      preferVoice: true,
      thinkAloud: true,
      scored: true,
      choices: PLAYS,
      prompt: () => [
        {
          type: 'p',
          text: 'Engineering can give you **one sprint** (two weeks). What is the main fix?',
        },
        {
          type: 'p',
          text: 'Pick one, then explain why, how much of the lost revenue you expect to recover and how fast, and the risk you are accepting.',
        },
      ],
      reviewerGuide: () => [
        {
          type: 'p',
          text: 'Redirects are the standard fix: 301 each old category URL to its closest new equivalent, which recovers most rankings within weeks. A rollback can work but means a second migration. Content and links address problems the evidence does not show.',
        },
        {
          type: 'p',
          text: 'Content or links can still score on reasoning if the candidate argues it well, but should lose on use of evidence. Look for a recovery estimate that is partial and gradual (not instant or 100%) and a named risk (unmapped or merged categories, redirect chains, losing time).',
        },
      ],
      rubric: [
        {
          id: 'reasoning',
          label: 'Fix matches the diagnosis',
          weight: 2,
          anchors: [
            'Choice unrelated to the evidence.',
            'Plausible but not tied to the data.',
            'Fix addresses the cause the data shows.',
            'Also weighs the alternatives and the cost of waiting.',
          ],
        },
        {
          id: 'estimate',
          label: 'Realistic recovery estimate',
          weight: 1,
          anchors: [
            'No estimate.',
            'Instant or full recovery assumed.',
            'Partial recovery over weeks, with a rough number.',
            'A range with assumptions and what to monitor.',
          ],
        },
        {
          id: 'risk',
          label: 'Risk and execution detail',
          weight: 1,
          anchors: [
            'No risk named.',
            'Generic risk.',
            'Specific execution risk (mapping, chains, merged categories).',
            'Specific risk plus how they would test it before launch.',
          ],
        },
      ],
      followUps: (_ctx, answer) => [
        `You chose "${answer.choiceLabel ?? 'your option'}". What would make you switch to a different fix?`,
        'What would you check on the day the fix goes live?',
      ],
    },
    {
      id: 'three-weeks-later',
      kind: 'branch',
      title: 'Three weeks later',
      summary: 'The situation changes based on their plan. Tests whether they adapt and own the result.',
      timeLimitSec: 300,
      voiceMaxSec: 120,
      preferVoice: true,
      scored: true,
      dependsOn: 'recovery-plan',
      prompt: (ctx) => {
        const v = ctx.variant;
        const { fmt } = ctx;
        const byChoice: Record<string, Block[]> = {
          redirects: [
            {
              type: 'p',
              text: `Category traffic is back to ${fmt.pct(n(v, 'recoveredPct'))} of where it was. But ${n(v, 'mergedUrls')} old categories were merged on the new site, and the developer redirected them all to the home page. Search Console flags them as "soft 404". The CEO asks when you will be fully back.`,
            },
            { type: 'p', text: '**What do you do about the merged categories, and what do you tell the CEO?**' },
          ],
          rollback: [
            {
              type: 'p',
              text: `Engineering now says the rollback will take ${n(v, 'rollbackWeeks')} weeks, not one sprint, and breaks the new filters. Meanwhile Google has started indexing some \`/c/\` pages. Category traffic has not moved.`,
            },
            { type: 'p', text: '**Do you continue the rollback? What do you tell the CEO?**' },
          ],
          content: [
            {
              type: 'p',
              text: `The team rewrote ${n(v, 'contentPages')} category pages. Category traffic has not moved, and Search Console now reports ${fmt.num(n(v, 'notFoundLater'))} 404s. The CEO asks why nothing has changed.`,
            },
            { type: 'p', text: '**What do you tell the CEO, and what do you do now?**' },
          ],
          links: [
            {
              type: 'p',
              text: `The agency built ${n(v, 'links')} links to category pages for ${fmt.money(n(v, 'linksBudget'))}. Category traffic has not moved, and some of the links point to old \`/category/\` URLs that return 404. The CEO asks what the money bought.`,
            },
            { type: 'p', text: '**What do you tell the CEO, and what do you do now?**' },
          ],
        };
        return byChoice[ctx.choices['recovery-plan'] ?? 'redirects'] ?? byChoice.redirects;
      },
      reviewerGuide: (ctx) => {
        const guides: Record<string, string> = {
          redirects:
            'Tests detail and expectations. Strong: redirect each merged category to its closest new category (not the home page), check for chains, and give the CEO a realistic timeline with the remaining gap. Weak: says it will recover by itself or promises 100%.',
          rollback:
            'Tests changing course. Strong: recognises a second migration is now riskier than redirects, switches to a redirect map, and tells the CEO plainly. Weak: pushes on with the rollback because it was the plan.',
          content:
            'Tests admitting a wrong call. Strong: says the evidence pointed to the 404s, switches to redirects immediately, and owns the lost weeks. Weak: asks for more time for content to work.',
          links:
            'Tests admitting a wrong call. Strong: says links cannot help pages that 404, fixes redirects first (which also recovers the old links), and is honest about the spend. Weak: defends the campaign or asks for more budget.',
        };
        const choice = ctx.choices['recovery-plan'] ?? 'redirects';
        return [
          { type: 'p', text: `They chose **${PLAYS.find((p) => p.id === choice)?.label ?? choice}**.` },
          { type: 'p', text: guides[choice] ?? guides.redirects },
        ];
      },
      rubric: [
        {
          id: 'adapt',
          label: 'Adapts to the new information',
          weight: 2,
          anchors: [
            'Ignores it or sticks to the plan regardless.',
            'Acknowledges it with a thin response.',
            'Changes course where the evidence says to.',
            'Changes course, owns the earlier call and says what would trigger more.',
          ],
        },
        {
          id: 'stakeholders',
          label: 'Honest with the CEO',
          weight: 1,
          anchors: [
            'Defensive or vague.',
            'Hedged or overpromising.',
            'Clear about what happened and the timeline.',
            'Clear, with a realistic recovery range and when they will report back.',
          ],
        },
        {
          id: 'action',
          label: 'Concrete next steps',
          weight: 1,
          anchors: [
            'No action.',
            'Vague actions.',
            'Specific actions in order.',
            'Specific actions with owners and a success check.',
          ],
        },
      ],
      followUps: () => [
        'What would you put in place so the next migration does not lose rankings?',
        'Knowing this, would you choose the same fix again?',
      ],
    },
    {
      id: 'agency-audit',
      kind: 'critique',
      title: "Review the agency's audit",
      summary:
        'Critique an agency audit whose recommendations would block the new category pages from Google. Think aloud.',
      timeLimitSec: 420,
      voiceMaxSec: 180,
      preferVoice: false,
      thinkAloud: true,
      scored: true,
      prompt: () => [
        {
          type: 'p',
          text: 'Before you joined, the CEO hired an agency for an audit. Their top recommendations are below and engineering is about to start on them. **Name the three most important problems, most important first, and what you would do instead.**',
        },
        { type: 'p', text: 'You do not need to comment on every line.' },
      ],
      material: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'h', text: `SEO audit: ${s(v, 'company')}, top recommendations` },
          {
            type: 'list',
            ordered: true,
            items: [
              '**Crawl budget:** add `Disallow: /c/` to robots.txt so Google stops wasting crawl budget on filter pages.',
              `**Consolidate authority:** set the canonical tag on every category page to the home page (\`${s(v, 'domain')}/\`).`,
              '**Core update recovery:** raise keyword density on category pages to 3%.',
              '**Speed:** compress the hero images on category pages to improve Largest Contentful Paint.',
              '**Redirects:** lower priority. Revisit next quarter once the content work is done.',
            ],
          },
        ];
      },
      reviewerGuide: (ctx) => {
        const v = ctx.variant;
        return [
          { type: 'p', text: 'Planted problems:' },
          {
            type: 'list',
            items: [
              `**robots.txt would block every category page.** \`Disallow: /c/\` blocks all of \`${url(v, 'c', 'category')}\`, \`${url(v, 'c', 'category2')}\` and the rest, not just filter pages. This is the most damaging line.`,
              '**Canonicals to the home page** tell Google the category pages are duplicates of the home page, so they drop out of results.',
              '**Postponing redirects** postpones the actual fix for the drop.',
              '**Keyword density** is outdated advice and not related to the core update.',
            ],
          },
          {
            type: 'p',
            text: 'Image compression for LCP is sensible, just not urgent. Ranking it as a top problem is a negative signal. Strong answers say engineering must not ship items 1, 2 and 5 as written.',
          },
        ];
      },
      rubric: [
        {
          id: 'flaws',
          label: 'Finds the damaging recommendations',
          weight: 2,
          anchors: [
            'Misses the robots.txt and canonical problems.',
            'Finds one of them.',
            'Finds robots.txt and canonicals and explains the effect.',
            'Finds robots.txt, canonicals and the postponed redirects, and why each would hurt.',
          ],
        },
        {
          id: 'ranking',
          label: 'Ranks by impact',
          weight: 1,
          anchors: [
            'No ranking, or ranks image compression highly.',
            'Ranking without reasons.',
            'Sensible ranking with reasons.',
            'Ranking tied to revenue and urgency.',
          ],
        },
        {
          id: 'fixes',
          label: 'Concrete alternative',
          weight: 1,
          anchors: [
            'Criticism only.',
            'Vague fixes.',
            'A specific correct fix for each problem (scoped robots rules, self-referencing canonicals).',
            'Specific fixes plus how to stop engineering shipping the bad ones.',
          ],
        },
      ],
      followUps: () => [
        'If filter pages really were wasting crawl budget, how would you handle them?',
        'Which recommendation did you think was fine, and why?',
      ],
    },
    {
      id: 'update',
      kind: 'ai_allowed',
      title: 'CEO update and redirect ticket (AI allowed)',
      summary:
        'Write the CEO update and the engineering ticket for the redirects with any AI tool, and paste the conversation. Shows how they work with AI.',
      timeLimitSec: 540,
      voiceMaxSec: 0,
      preferVoice: false,
      scored: true,
      prompt: () => [
        { type: 'p', text: AI_ALLOWED_INTRO },
        {
          type: 'p',
          text: 'Write (a) a five-line update to the CEO on the cause and the plan, and (b) an engineering ticket for the category redirects, with acceptance criteria.',
        },
        { type: 'list', ordered: true, items: AI_ALLOWED_STEPS },
      ],
      reviewerGuide: (ctx) => [
        {
          type: 'p',
          text: `Check the transcript: did they give the AI the real facts (category URLs from \`/category/\` to \`/c/\`, ${ctx.fmt.num(n(ctx.variant, 'notFound'))} 404s)? AI drafts often blame the core update, suggest 302s or redirecting everything to the home page, or omit testing.`,
        },
        {
          type: 'p',
          text: 'Strong tickets: one-to-one 301s from each old URL to its closest new one, no chains, a crawl of the old URL list as acceptance, and an updated sitemap. Strong CEO updates are plain and give a realistic timeline.',
        },
      ],
      rubric: [
        {
          id: 'judgment',
          label: 'Judgment with AI',
          weight: 2,
          anchors: [
            'Pasted output unchanged, errors kept.',
            'Light edits; did not give the AI the real context.',
            'Gave the AI the context and fixed its mistakes.',
            'Used AI deliberately and rejected weak suggestions with reasons.',
          ],
        },
        {
          id: 'accuracy',
          label: 'Technically correct',
          weight: 1,
          anchors: [
            'Wrong redirect type or approach.',
            'Mostly right, key gaps.',
            'Correct 301 mapping with testable acceptance criteria.',
            'Also covers edge cases (merged categories, chains, internal links).',
          ],
        },
        {
          id: 'clarity',
          label: 'Clear for each audience',
          weight: 1,
          anchors: [
            'Jargon for the CEO, vague for engineering.',
            'Serviceable.',
            'Plain for the CEO, precise for engineering.',
            'Both could act on it without asking a question.',
          ],
        },
      ],
      followUps: () => [
        'What did the AI get wrong first time?',
        'How would you know the redirects are working a week after launch?',
      ],
    },
    pastWorkStage({
      id: 'real-seo',
      title: 'A real SEO change',
      summary: "A real SEO change they made or recommended that didn't work. Checks specificity and ownership.",
      question: 'Tell us about an SEO change you made or recommended that hurt traffic or did not help.',
    }),
  ],
};
