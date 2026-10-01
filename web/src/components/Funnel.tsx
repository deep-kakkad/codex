import type { AssessmentFunnel } from '../../../shared/api';
import { formatDuration } from '../../../shared/signals';
import { KindBadge } from './ui';

interface Step {
  key: string;
  /** Plain-text name, used in sentences. */
  name: string;
  label: React.ReactNode;
  count: number;
  detail: string[];
}

/**
 * Where candidates drop off. A table (so every number is readable without the
 * bars) with one inline bar per step in a single hue: the bar length is the
 * share of invited candidates who got that far.
 */
export function Funnel({ funnel }: { funnel: AssessmentFunnel }) {
  const steps: Step[] = [
    { key: 'invited', name: 'Invited', label: 'Invited', count: funnel.invited, detail: [] },
    {
      key: 'started',
      name: 'Started',
      label: 'Started',
      count: funnel.started,
      detail: funnel.stalledBeforeFirst ? [`${funnel.stalledBeforeFirst} stalled before the first question`] : [],
    },
    ...funnel.stages.map((s, i) => ({
      key: s.id,
      name: `Q${i + 1} ${s.title}`,
      label: (
        <>
          Q{i + 1} {s.title} <KindBadge kind={s.kind} />
        </>
      ),
      count: s.reached,
      detail: [
        s.medianTimeSec !== null
          ? `median ${formatDuration(s.medianTimeSec)} of ${formatDuration(s.timeLimitSec)}`
          : '',
        s.timedOut ? `${s.timedOut} ran out of time` : '',
        s.stalledHere ? `${s.stalledHere} stalled here` : '',
      ].filter(Boolean),
    })),
    { key: 'finished', name: 'Finished', label: 'Finished', count: funnel.finished, detail: [] },
  ];

  // The biggest fall between consecutive steps after "Started".
  let biggest = { index: -1, drop: 0 };
  for (let i = 2; i < steps.length; i++) {
    const drop = steps[i - 1].count - steps[i].count;
    if (drop > biggest.drop) biggest = { index: i, drop };
  }
  const base = Math.max(funnel.invited, 1);
  const pct = (n: number) => `${Math.round((n / base) * 100)}%`;

  return (
    <div className="card funnel">
      <div className="row-between">
        <h2 className="section-title">Where candidates drop off</h2>
        <span className="small muted">Stalled = started but no activity for {funnel.stalledAfterHours} hours</span>
      </div>
      {biggest.index > 0 && (
        <p className="small">
          Biggest drop: <strong>{biggest.drop}</strong> candidate{biggest.drop === 1 ? '' : 's'} between “
          {steps[biggest.index - 1].name}” and “{steps[biggest.index].name}”.
        </p>
      )}
      <table className="funnel-table">
        <thead>
          <tr>
            <th scope="col">Step</th>
            <th scope="col" className="sr-only-col">
              Share of invited
            </th>
            <th scope="col" className="num">
              Candidates
            </th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step, i) => (
            <tr key={step.key} className={i === biggest.index ? 'funnel-drop' : ''}>
              <th scope="row">
                <div className="funnel-label">{step.label}</div>
                {step.detail.length > 0 && <div className="small muted">{step.detail.join(' · ')}</div>}
              </th>
              <td className="funnel-bar-cell" title={`${step.count} of ${funnel.invited} invited (${pct(step.count)})`}>
                <div className="funnel-track" aria-hidden="true">
                  <div className="funnel-bar" style={{ width: pct(step.count) }} />
                </div>
              </td>
              <td className="num">
                {step.count} <span className="muted small">{pct(step.count)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
