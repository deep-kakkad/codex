import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AssessmentDetail, CandidateReport, RoleFamilyPreview, RoleFamilySummary } from '../shared/api';
import type { CandidateSession } from '../shared/candidateApi';
import { buildPreview } from '../shared/library';
import { ROLE_FAMILIES } from '../shared/roleFamilies';
import { buildDemoData, DEMO_DATA_DIR, FULL_PREVIEW_FAMILIES, PREVIEW_SEED } from '../server/demoData';
import { handle, restartCandidateDemo, showCandidateFrame } from '../web/src/demo/fakeApi';
import { DEMO_SAMPLE_CANDIDATE } from '../web/src/demo/mode';
import { REVIEW_STEP, TOURS } from '../web/src/demo/tourSteps';

const committed = (file: string) => readFileSync(path.join(DEMO_DATA_DIR, file), 'utf8');

describe('static demo data', () => {
  const files = buildDemoData();

  it('is up to date with the role families (run npm run demo-data)', () => {
    for (const [file, data] of Object.entries(files)) {
      expect(JSON.parse(committed(file)), file).toEqual(data);
    }
  });

  it('leaves out the answer key and rubric of every role without sample candidates', () => {
    for (const family of ROLE_FAMILIES) {
      const text = committed(`previews/${family.id}.json`);
      const full = buildPreview(family, PREVIEW_SEED, 'INR');
      if (FULL_PREVIEW_FAMILIES.includes(family.id)) {
        // The sample candidates' reports show these anyway.
        expect(text).toContain(JSON.stringify(full.stages[1].rubric[0].anchors[0]));
        continue;
      }
      for (const stage of full.stages) {
        for (const criterion of stage.rubric) {
          for (const anchor of criterion.anchors) expect(text, family.id).not.toContain(JSON.stringify(anchor));
        }
      }
      const guides = full.stages.flatMap((s) => s.variants.flatMap((v) => v.reviewerGuide));
      const longest = guides
        .map((b) => JSON.stringify(b))
        .sort((a, b) => b.length - a.length)
        .slice(0, 3);
      for (const block of longest) expect(text, family.id).not.toContain(block);
    }
  });
});

describe('static demo API', () => {
  it('serves the recruiter side from sample data', async () => {
    const { assessments } = (await handle('GET', '/api/assessments')) as { assessments: { id: string }[] };
    expect(assessments.length).toBeGreaterThan(0);
    const sample = (await handle('GET', `/api/candidates/${DEMO_SAMPLE_CANDIDATE}`)) as CandidateReport;
    expect(sample.aiReview?.status).toBe('done');

    const { families } = (await handle('GET', '/api/role-families')) as { families: RoleFamilySummary[] };
    expect(families).toHaveLength(ROLE_FAMILIES.length);
    const hidden = (await handle('GET', '/api/role-families/sales-sdr/preview?currency=USD')) as RoleFamilyPreview;
    expect(hidden.currency).toBe('USD');
    expect(hidden.stages.every((s) => s.rubric.length === 0)).toBe(true);

    const { id } = (await handle('POST', '/api/assessments', {
      title: 'SDR',
      roleFamilyId: 'sales-sdr',
      currency: 'INR',
      stageIds: hidden.stages.slice(0, 3).map((s) => s.id),
    })) as { id: string };
    const { candidate } = (await handle('POST', `/api/assessments/${id}/candidates`, {
      name: 'Test Person',
      email: 'test@example.com',
    })) as { candidate: { id: string } };
    const detail = (await handle('GET', `/api/assessments/${id}`)) as AssessmentDetail;
    expect(detail.family.stages).toHaveLength(3);
    expect(detail.candidates).toHaveLength(1);
    const report = (await handle('GET', `/api/candidates/${candidate.id}`)) as CandidateReport;
    expect(report.candidate.status).toBe('invited');
    expect(report.stages).toHaveLength(3);
    await expect(handle('POST', `/api/candidates/${candidate.id}/ai-review`)).rejects.toThrow(/written in advance/);
  });

  it('takes a candidate through the short assessment', async () => {
    restartCandidateDemo();
    let session = (await handle('GET', '/api/c/demo')) as CandidateSession;
    expect(session.state.phase).toBe('intro');
    session = (await handle('POST', '/api/c/demo/start', { idName: 'Riya Sharma', consent: true })) as CandidateSession;
    for (let i = 0; session.state.phase === 'ready'; i++) {
      session = (await handle('POST', '/api/c/demo/next', { index: i })) as CandidateSession;
      if (session.state.phase !== 'stage') throw new Error(`expected a stage, got ${session.state.phase}`);
      const stage = session.state.stage;
      expect(stage.prompt.length).toBeGreaterThan(0);
      session = (await handle('POST', `/api/c/demo/stages/${stage.id}/submit`, {
        text: 'My answer',
        choiceId: stage.choices?.[0]?.id,
      })) as CandidateSession;
    }
    expect(session.state.phase).toBe('done');
    await expect(handle('GET', '/api/c/someone-else')).rejects.toThrow(/demo/);
  });

  it('shows each screen of the candidate walkthrough without a running clock', async () => {
    const phases: [Parameters<typeof showCandidateFrame>[0], string, number?][] = [
      ['intro', 'intro'],
      ['brief', 'ready'],
      [0, 'stage', 0],
      [1, 'stage', 1],
      [2, 'stage', 2],
      [3, 'stage', 3],
      ['done', 'done'],
    ];
    for (const [frame, phase, index] of phases) {
      showCandidateFrame(frame);
      const session = (await handle('GET', '/api/c/demo')) as CandidateSession;
      expect(session.state.phase, String(frame)).toBe(phase);
      if (session.state.phase === 'stage') {
        expect(session.state.stage.index).toBe(index);
        expect(session.state.deadlineAt).toBeGreaterThan(Date.now() + 60 * 60 * 1000);
      }
    }
  });

  it('has tours that start on the right pages', () => {
    expect(TOURS.recruiter[0].path).toBe('/app');
    expect(TOURS.recruiter.at(-1)?.end).toBe(true);
    expect(TOURS.candidate.at(-1)?.end).toBe(true);
    expect(TOURS.recruiter[REVIEW_STEP].path).toBe(`/app/candidates/${DEMO_SAMPLE_CANDIDATE}`);
    for (const step of [...TOURS.recruiter, ...TOURS.candidate]) expect(step.end || step.target).toBeTruthy();
  });
});
