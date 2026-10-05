import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROLE_FAMILIES } from '../shared/roleFamilies';
import { ROLES, VERSUS, pageMeta, publicPaths } from '../web/src/marketing/content';
import { roi } from '../web/src/pages/Marketing';
import { ROBOTS, pageHtml, renderPage, sitemap } from '../server/prerender';

/** Rendered markup as plain text, so it compares with the source strings. */
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const SHELL = `<!doctype html><html><head><meta name="description" content="x" /><title>Proofwork</title></head><body><div id="root"></div></body></html>`;

describe('public pages', () => {
  it('has a page for every role in the library and every comparison', () => {
    expect(ROLES.map((r) => r.id).sort()).toEqual(ROLE_FAMILIES.map((f) => f.id).sort());
    const paths = publicPaths();
    expect(paths).toHaveLength(1 + 1 + ROLE_FAMILIES.length + VERSUS.length + 4);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('renders each one to HTML with its own title and description', () => {
    for (const path of publicPaths()) {
      const meta = pageMeta(path);
      expect(meta, path).not.toBeNull();
      expect(meta!.description.length, path).toBeLessThanOrEqual(160);
      const html = pageHtml(SHELL, path);
      expect(html).toContain('<h1');
      expect(html).toContain(
        `<link rel="canonical" href="https://proofwork-hiring.netlify.app${path === '/' ? '' : path}" />`,
      );
      expect(html).not.toContain('<title>Proofwork</title>');
    }
  });

  it('keeps what each question checks for off the public role pages', () => {
    for (const family of ROLE_FAMILIES) {
      const html = text(renderPage(`/roles/${family.id}`));
      expect(html).toContain(family.name);
      for (const stage of family.stages) expect(html, `${family.id}/${stage.id}`).not.toContain(stage.summary);
      expect(html).not.toMatch(/anchors|reviewerGuide|answer key/i);
    }
  });

  it('serves unknown roles and comparisons the not-found page', () => {
    expect(renderPage('/roles/not-a-role')).not.toContain('assessment</h1>');
    expect(renderPage('/compare/not-a-tool')).not.toContain('Proofwork vs');
  });

  it('lists the pages in the sitemap and keeps private areas out of search', () => {
    const xml = sitemap(publicPaths());
    for (const path of publicPaths()) expect(xml).toContain(`<loc>https://proofwork-hiring.netlify.app${path}</loc>`);
    const robots = ROBOTS('https://x/sitemap.xml');
    for (const area of ['/app', '/admin', '/c/', '/apply/', '/candidate'])
      expect(robots).toContain(`Disallow: ${area}`);
    // Every other route falls back to the plain app shell, not the prerendered landing page.
    expect(readFileSync('netlify.toml', 'utf8')).toMatch(/from = "\/\*"\s+to = "\/app.html"/);
  });
});

describe('ROI calculator', () => {
  it('counts the hours saved and picks the cheapest plan', () => {
    const result = roi({
      hires: 10,
      screened: 20,
      screenMinutes: 30,
      interviews: 6,
      interviewHours: 1.5,
      hourCost: 1000,
      finishRate: 50,
      readMinutes: 6,
      interviewsAfter: 3,
    });
    // Today: 10 × (20 × 0.5 h + 6 × 1.5 h) = 190 h. With Proofwork: 10 × (20 × 0.1 h + 3 × 1.5 h) = 65 h.
    expect(result.before).toBeCloseTo(190);
    expect(result.after).toBeCloseTo(65);
    expect(result.saved).toBeCloseTo(125);
    expect(result.value).toBeCloseTo(125_000);
    // 100 finished candidates: pay as you go (₹24,900) beats Starter yearly (₹49,990).
    expect(result.reviews).toBe(100);
    expect(result.plan).toEqual({ name: 'Pay as you go', cost: 24_900 });
  });

  it('switches to a yearly plan at volume', () => {
    const result = roi({
      hires: 40,
      screened: 30,
      screenMinutes: 30,
      interviews: 6,
      interviewHours: 1.5,
      hourCost: 1000,
      finishRate: 70,
      readMinutes: 6,
      interviewsAfter: 3,
    });
    // 840 reviews: Starter yearly is ₹49,990 + 360 extras × ₹149 = ₹1,03,630; pay as you go would be ₹2,09,160.
    expect(result.reviews).toBe(840);
    expect(result.plan.name).toBe('Starter, billed yearly');
    expect(result.plan.cost).toBe(103_630);
  });
});
