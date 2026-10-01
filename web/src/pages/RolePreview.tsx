import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { RoleFamilyPreview } from '../../../shared/api';
import { Blocks } from '../components/Blocks';
import { Collapsible, ErrorNote, KindBadge } from '../components/ui';
import { formatMinutes, useApi } from '../hooks';

export function RolePreview() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const currency = params.get('currency') === 'USD' ? 'USD' : 'INR';
  const seed = params.get('seed');
  const { data, error, loading } = useApi<RoleFamilyPreview>(
    `/api/role-families/${id}/preview?currency=${currency}${seed ? `&seed=${seed}` : ''}`,
  );

  const regenerate = () => {
    const next = new URLSearchParams(params);
    next.set('seed', String(Math.floor(Math.random() * 2 ** 31)));
    setParams(next);
  };
  const setCurrency = (value: string) => {
    const next = new URLSearchParams(params);
    next.set('currency', value);
    if (data) next.set('seed', String(data.seed));
    setParams(next);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/app/library" className="small muted">
            ← Role library
          </Link>
          <h1>{data?.family.name ?? 'Preview'}</h1>
          {data?.family.generated ? (
            <p className="muted">
              Written by AI from your description; every candidate sees this exact version. Check the numbers, the
              planted flaws and the answer key before you use it: the AI scores candidates against this key.
            </p>
          ) : (
            <p className="muted">
              One sample version of the scenario. Every candidate gets different names and numbers; the answer key
              adapts.
            </p>
          )}
        </div>
        {data && !data.family.generated && (
          <div className="row-gap">
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency">
              <option value="INR">₹ INR</option>
              <option value="USD">$ USD</option>
            </select>
            <button className="btn btn-secondary" onClick={regenerate} disabled={loading}>
              Generate another version
            </button>
          </div>
        )}
      </div>
      <ErrorNote error={error} />
      {data && (
        <>
          <section className="card">
            <h2 className="section-title">Scenario brief</h2>
            <Blocks blocks={data.brief} />
          </section>
          {data.stages.map((stage, index) => (
            <section key={stage.id} className="card stage-review">
              <header className="stage-review-head">
                <div>
                  <span className="muted small">Q{index + 1}</span> <strong>{stage.title}</strong>{' '}
                  <KindBadge kind={stage.kind} />
                </div>
                <span className="small muted">
                  {formatMinutes(stage.timeLimitSec)}
                  {!stage.scored && ' · not scored'}
                </span>
              </header>
              {stage.variants.map((variant, i) => (
                <div key={i} className={stage.variants.length > 1 ? 'branch-variant' : ''}>
                  {variant.label && <div className="branch-label">{variant.label}</div>}
                  <Blocks blocks={variant.prompt} />
                  {i === 0 && stage.choices && (
                    <ul className="choice-preview">
                      {stage.choices.map((c) => (
                        <li key={c.id}>{c.label}</li>
                      ))}
                    </ul>
                  )}
                  {i === 0 && stage.material.length > 0 && (
                    <div className="material">
                      <Blocks blocks={stage.material} />
                    </div>
                  )}
                  <Collapsible title="Reviewer guide" className="inset guide">
                    <Blocks blocks={variant.reviewerGuide} />
                  </Collapsible>
                </div>
              ))}
              {stage.rubric.length > 0 && (
                <Collapsible title={`Rubric (${stage.rubric.length} criteria)`} className="inset">
                  {stage.rubric.map((criterion) => (
                    <div key={criterion.id} className="criterion">
                      <div className="criterion-label">
                        {criterion.label}
                        {criterion.weight > 1 && <span className="small muted"> · counts ×{criterion.weight}</span>}
                      </div>
                      <div className="anchors">
                        {criterion.anchors.map((anchor, i) => (
                          <div key={i} className="anchor static">
                            <span className="anchor-score">{i + 1}</span>
                            <span className="anchor-text">{anchor}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </Collapsible>
              )}
            </section>
          ))}
        </>
      )}
    </>
  );
}
