import { Fragment, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { CandidateReport, ReportStage } from '../../../shared/api';
import { api, errorMessage } from '../api';
import { Icon } from '../components/Icon';
import { DecisionBadge, ErrorNote, KindBadge, RecommendationBadge, Score, StatusBadge } from '../components/ui';

const MAX = 4;

/** Two to four candidates on the same assessment, side by side, question by question. */
export function ComparePage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean).slice(0, MAX);
  const key = ids.join(',');
  const [reports, setReports] = useState<CandidateReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    Promise.all(key.split(',').map((candidateId) => api.get<CandidateReport>(`/api/candidates/${candidateId}`)))
      .then((loaded) => !cancelled && setReports(loaded.filter((r) => r.assessment.id === id)))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [key, id]);

  if (error) return <ErrorNote error={error} />;
  if (!reports) return <p className="muted">Loading…</p>;
  if (reports.length < 2) {
    return (
      <div className="empty">
        <h2>Pick at least two candidates</h2>
        <p className="muted">Tick finished candidates on the assessment page, then choose Compare.</p>
        <Link to={`/app/assessments/${id}`} className="btn btn-secondary">
          Back to the assessment
        </Link>
      </div>
    );
  }

  const stages = reports[0].stages.filter((s) => s.scored);
  const overall = (r: CandidateReport) => r.adjusted?.overall ?? r.aiReview?.result?.overall ?? null;
  const stageScore = (r: CandidateReport, stageId: string) =>
    r.adjusted?.byStage[stageId] ?? r.aiReview?.result?.byStage[stageId] ?? null;
  const best = (values: (number | null)[]) => {
    const scored = values.filter((v): v is number => v !== null);
    return scored.length > 1 ? Math.max(...scored) : null;
  };
  const toggle = (stageId: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  const overallBest = best(reports.map(overall));

  return (
    <>
      <div className="page-head">
        <div>
          <Link to={`/app/assessments/${id}`} className="back-link">
            <Icon name="back" size={14} />
            {reports[0].assessment.title}
          </Link>
          <h1>Compare {reports.length} candidates</h1>
          <p className="muted">
            Same questions, side by side. Highlighted cells are the highest score in the row. Open a question to see
            each criterion with the AI's evidence.
          </p>
        </div>
      </div>

      <div className="card flush">
        <div className="table-scroll">
          <table className="compare-table" style={{ ['--cols' as string]: reports.length }}>
            <thead>
              <tr>
                <th className="compare-label" />
                {reports.map((r) => (
                  <th key={r.candidate.id}>
                    <Link to={`/app/candidates/${r.candidate.id}`} className="strong-link">
                      {r.candidate.name}
                    </Link>
                    <div className="row-gap">
                      <StatusBadge status={r.candidate.status} />
                      <DecisionBadge decision={r.candidate.decision} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="compare-overall">
                <th className="compare-label">Overall</th>
                {reports.map((r) => (
                  <td
                    key={r.candidate.id}
                    className={overall(r) !== null && overall(r) === overallBest ? 'is-best' : ''}
                  >
                    {r.aiReview?.result ? (
                      <div className="compare-score">
                        <span className="compare-big">
                          <Score value={overall(r)} />
                        </span>
                        <RecommendationBadge value={r.adjusted?.recommendation ?? r.aiReview.result.recommendation} />
                      </div>
                    ) : (
                      <span className="small muted">No AI review yet</span>
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <th className="compare-label">Summary</th>
                {reports.map((r) => (
                  <td key={r.candidate.id} className="small">
                    {r.aiReview?.result?.summary ?? <span className="subtle">—</span>}
                  </td>
                ))}
              </tr>

              <tr className="compare-section">
                <th colSpan={reports.length + 1}>By question</th>
              </tr>
              {stages.map((stage) => (
                <QuestionRows
                  key={stage.id}
                  stage={stage}
                  reports={reports}
                  open={open.has(stage.id)}
                  onToggle={() => toggle(stage.id)}
                  stageScore={stageScore}
                  best={best(reports.map((r) => stageScore(r, stage.id)))}
                />
              ))}

              <tr className="compare-section">
                <th colSpan={reports.length + 1}>Strengths and concerns</th>
              </tr>
              <tr>
                <th className="compare-label">Strengths</th>
                {reports.map((r) => (
                  <td key={r.candidate.id}>
                    <ul className="icon-list good small">
                      {(r.aiReview?.result?.strengths ?? []).map((s, i) => (
                        <li key={i}>
                          <Icon name="check" size={13} />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </td>
                ))}
              </tr>
              <tr>
                <th className="compare-label">Concerns</th>
                {reports.map((r) => (
                  <td key={r.candidate.id}>
                    <ul className="icon-list warn small">
                      {(r.aiReview?.result?.concerns ?? []).map((s, i) => (
                        <li key={i}>
                          <Icon name="x" size={13} />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </td>
                ))}
              </tr>
              <tr>
                <th className="compare-label">With and without AI</th>
                {reports.map((r) => (
                  <td key={r.candidate.id} className="small">
                    {r.aiReview?.result?.withAndWithoutAi || <span className="subtle">—</span>}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function QuestionRows({
  stage,
  reports,
  open,
  onToggle,
  stageScore,
  best,
}: {
  stage: ReportStage;
  reports: CandidateReport[];
  open: boolean;
  onToggle: () => void;
  stageScore: (r: CandidateReport, stageId: string) => number | null;
  best: number | null;
}) {
  return (
    <>
      <tr className="compare-question">
        <th className="compare-label">
          <button className="compare-toggle" onClick={onToggle} aria-expanded={open}>
            <span className="chevron" style={{ transform: open ? 'rotate(90deg)' : undefined }}>
              ▸
            </span>
            <span>
              <span className="subtle">Q{stage.index + 1}</span> {stage.title}
              <span className="compare-kind">
                <KindBadge kind={stage.kind} />
              </span>
            </span>
          </button>
        </th>
        {reports.map((r) => {
          const ai = r.aiReview?.result?.stages.find((s) => s.stageId === stage.id) ?? null;
          const response = r.stages.find((s) => s.id === stage.id)?.response ?? null;
          const score = stageScore(r, stage.id);
          return (
            <td key={r.candidate.id} className={score !== null && score === best ? 'is-best' : ''}>
              <div className="compare-score">
                <Score value={score} />
                {ai?.delivery?.label === 'read' && <span className="badge badge-warn">sounds read</span>}
                {response?.closedReason === 'timeout' && <span className="badge badge-muted">ran out of time</span>}
              </div>
              {response?.choiceLabel && <div className="tiny muted">Chose: {response.choiceLabel}</div>}
              {ai?.summary && <p className="compare-note">{ai.summary}</p>}
            </td>
          );
        })}
      </tr>
      {open &&
        stage.rubric.map((criterion) => {
          const scores = reports.map(
            (r) => r.aiReview?.result?.stages.find((s) => s.stageId === stage.id)?.criteria[criterion.id] ?? null,
          );
          const overrides = reports.map((r) =>
            r.overrides.find((o) => o.stageId === stage.id && o.criterionId === criterion.id),
          );
          return (
            <tr key={criterion.id} className="compare-criterion">
              <th className="compare-label">
                {criterion.label}
                {criterion.weight > 1 && <span className="tiny subtle"> ×{criterion.weight}</span>}
              </th>
              {reports.map((r, i) => (
                <td key={r.candidate.id}>
                  {scores[i] ? (
                    <Fragment>
                      <div className="compare-score">
                        <Score value={overrides[i]?.score ?? scores[i]!.score} />
                        {overrides[i] && <span className="tiny muted">changed from {scores[i]!.score}</span>}
                      </div>
                      {scores[i]!.evidence && <q className="compare-quote">{scores[i]!.evidence}</q>}
                    </Fragment>
                  ) : (
                    <span className="subtle">—</span>
                  )}
                </td>
              ))}
            </tr>
          );
        })}
    </>
  );
}
