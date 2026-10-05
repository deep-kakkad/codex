import { type FormEvent, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import type {
  AdminActivity,
  AdminError,
  AdminLead,
  AdminOverview,
  AdminRequest,
  AdminWorkspace,
} from '../../../shared/api';
import { type BillingCycle, PLAN_NAMES, type PlanId, USD_TO_INR } from '../../../shared/plans';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { ErrorNote } from '../components/ui';
import { formatDate, useApi } from '../hooks';

const TABS = [
  ['overview', 'Overview'],
  ['workspaces', 'Workspaces'],
  ['requests', 'Plan requests'],
  ['leads', 'Leads'],
  ['errors', 'Errors'],
  ['activity', 'Activity'],
  ['backups', 'Backups'],
] as const;
type Tab = (typeof TABS)[number][0];

const PLAN_IDS = Object.keys(PLAN_NAMES) as PlanId[];
const paid = (plan: string) => plan === 'starter' || plan === 'growth';
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const dollars = (n: number) => `$${n.toFixed(2)}`;
const day = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const cycle = (billing: BillingCycle) => (billing === 'annual' ? 'yearly' : 'monthly');

/** The console for people who run Proofwork: every customer workspace, plan request and lead. */
export function AdminPage() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find(([id]) => id === params.get('tab'))?.[0] ?? 'overview';
  const overview = useApi<AdminOverview>(user?.operator ? '/api/admin/overview' : null);

  if (loading) return <div className="page-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: '/admin' }} />;
  if (!user.operator) return <Navigate to="/app" replace />;

  const needsTwoFactor = /two-factor/i.test(overview.error ?? '');
  const open = (next: Tab, extra: Record<string, string> = {}) => setParams({ tab: next, ...extra });
  const counts: Partial<Record<Tab, number>> = {
    requests: overview.data?.openRequests,
    errors: overview.data?.errorsLast7,
  };

  return (
    <div className="admin-shell">
      <header className="admin-top">
        <Link to="/admin" className="brand admin-brand">
          <Logo /> Proofwork <span className="admin-tag">Admin</span>
        </Link>
        <div className="admin-top-right">
          <span className="small muted admin-who">{user.email}</span>
          <Link to="/app/settings" className="btn btn-ghost btn-sm">
            <Icon name="sliders" size={14} /> Account
          </Link>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            title="Log out"
            aria-label="Log out"
            onClick={async () => {
              await logout();
              navigate('/');
            }}
          >
            <Icon name="logout" />
          </button>
        </div>
      </header>
      <main className="admin-main">
        <div className="page-head">
          <div>
            <h1>Admin console</h1>
            <p className="muted">
              Every customer workspace, plan request and lead. Payments aren’t connected yet, so the plan you set here
              is what the customer gets.
            </p>
          </div>
        </div>
        {needsTwoFactor ? (
          <section className="card admin-gate">
            <span className="settings-icon" aria-hidden="true">
              <Icon name="shield" size={18} />
            </span>
            <div>
              <h2 className="section-title">Turn on two-factor sign-in first</h2>
              <p className="muted small">
                The admin console can change any customer’s plan, so it only opens for operator accounts that sign in
                with an authenticator code.
              </p>
              <Link to="/app/settings" className="btn btn-primary btn-sm">
                Set up two-factor sign-in
              </Link>
            </div>
          </section>
        ) : (
          <>
            <nav className="tabs" role="tablist" aria-label="Admin sections">
              {TABS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={tab === id ? 'active' : ''}
                  onClick={() => open(id)}
                >
                  {label}
                  {Boolean(counts[id]) && <span className="admin-count">{counts[id]}</span>}
                </button>
              ))}
            </nav>
            {tab === 'overview' && <Overview data={overview.data} error={overview.error} open={open} />}
            {tab === 'workspaces' && <Workspaces openId={params.get('open')} onChange={overview.reload} />}
            {tab === 'requests' && <Requests open={open} />}
            {tab === 'leads' && <Leads />}
            {tab === 'errors' && <Errors />}
            {tab === 'activity' && <Activity />}
            {tab === 'backups' && <Backups />}
          </>
        )}
      </main>
    </div>
  );
}

// Overview -------------------------------------------------------------------------------

function Stat({
  label,
  value,
  note,
  attention,
  onClick,
}: {
  label: string;
  value: string | number;
  note?: string;
  attention?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
      {note && <div className="admin-stat-note">{note}</div>}
    </>
  );
  const className = `kpi admin-stat ${attention ? 'kpi-attention' : ''}`;
  return onClick ? (
    <button type="button" className={`${className} is-link`} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

function Overview({
  data,
  error,
  open,
}: {
  data: AdminOverview | null;
  error: string | null;
  open: (tab: Tab) => void;
}) {
  if (error) return <ErrorNote error={error} />;
  if (!data) return <p className="muted">Loading…</p>;
  const reviews = data.reviewsThisMonth;
  const reviewTotal = reviews.plan + reviews.bonus + reviews.credit + reviews.extra;
  return (
    <>
      <div className="kpis admin-kpis">
        <Stat
          label="Customer workspaces"
          value={data.workspaces}
          note={`${data.newLast7} new this week · ${data.newLast30} in 30 days`}
          onClick={() => open('workspaces')}
        />
        <Stat
          label="Active in the last 30 days"
          value={data.activeLast30}
          note="Invited or heard back from a candidate"
        />
        <Stat
          label="Estimated monthly revenue"
          value={rupees(data.estimatedMrrInr)}
          note="Plans set here, plus this month’s extras"
        />
        <Stat
          label="AI cost this month"
          value={dollars(data.aiCostThisMonthUsd)}
          note={`About ${rupees(data.aiCostThisMonthUsd * USD_TO_INR)}`}
        />
        <Stat
          label="Candidates finished this month"
          value={data.candidatesFinishedThisMonth}
          note={`${data.candidatesInvitedThisMonth} invited this month`}
        />
        <Stat
          label="Open plan requests"
          value={data.openRequests}
          attention={data.openRequests > 0}
          onClick={() => open('requests')}
        />
        <Stat label="Demo leads, last 30 days" value={data.leadsLast30} onClick={() => open('leads')} />
        <Stat
          label="Errors, last 7 days"
          value={data.errorsLast7}
          attention={data.errorsLast7 > 0}
          onClick={() => open('errors')}
        />
      </div>
      <div className="admin-overview-grid">
        <section className="card">
          <SignupChart days={data.signupsByDay} />
        </section>
        <section className="card admin-reviews">
          <h2 className="section-title">Reviews this month</h2>
          <p className="admin-reviews-total">{reviewTotal}</p>
          <dl className="admin-reviews-list">
            <div>
              <dt>From plan allowances</dt>
              <dd>{reviews.plan}</dd>
            </div>
            <div>
              <dt>From referral bonuses</dt>
              <dd>{reviews.bonus}</dd>
            </div>
            <div>
              <dt>From prepaid credits</dt>
              <dd>{reviews.credit}</dd>
            </div>
            <div>
              <dt>Billable extras</dt>
              <dd>{reviews.extra}</dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  );
}

/** One bar a day, oldest on the left; each bar shows its count on hover or focus. */
function SignupChart({ days }: { days: AdminOverview['signupsByDay'] }) {
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const top = Math.max(1, ...days.map((d) => d.count));
  const label = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <figure className="admin-chart">
      <figcaption>
        <h2 className="section-title">Sign-ups, last 30 days</h2>
        <span className="muted small">
          {total} new workspace{total === 1 ? '' : 's'}
        </span>
      </figcaption>
      <div className="admin-bars" role="list">
        <span className="admin-bars-top" aria-hidden="true">
          {top}
        </span>
        {days.map((d) => (
          <div
            key={d.day}
            className="admin-bar"
            role="listitem"
            tabIndex={0}
            aria-label={`${label(d.day)}: ${d.count} sign-up${d.count === 1 ? '' : 's'}`}
          >
            <span className="admin-bar-fill" style={{ height: d.count ? `${(d.count / top) * 100}%` : 0 }} />
            <span className="admin-bar-tip" aria-hidden="true">
              <strong>{d.count}</strong> {label(d.day)}
            </span>
          </div>
        ))}
      </div>
      <div className="admin-bars-axis muted small" aria-hidden="true">
        <span>{label(days[0].day)}</span>
        <span>Today</span>
      </div>
    </figure>
  );
}

// Workspaces --------------------------------------------------------------------------

function Workspaces({ openId, onChange }: { openId: string | null; onChange: () => void }) {
  const { data, error, reload } = useApi<{ workspaces: AdminWorkspace[] }>('/api/admin/workspaces');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(openId);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = data?.workspaces ?? [];
    return q ? all.filter((w) => `${w.name} ${w.owner ?? ''}`.toLowerCase().includes(q)) : all;
  }, [data, query]);

  if (error) return <ErrorNote error={error} />;
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <section className="card flush">
      <div className="admin-toolbar padded">
        <label className="admin-search">
          <Icon name="search" size={15} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by company or email"
            aria-label="Search workspaces"
          />
        </label>
        <span className="small muted">
          {shown.length} of {data.workspaces.length}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="muted small padded">No workspaces match.</p>
      ) : (
        <div className="table-scroll">
          <table className="list-table admin-table">
            <thead>
              <tr>
                <th>Workspace</th>
                <th>Plan</th>
                <th className="num">Reviews this month</th>
                <th className="num">Free reviews</th>
                <th className="num">Waiting</th>
                <th className="num">Candidates</th>
                <th className="num">AI cost</th>
                <th>Last active</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {shown.map((w) => (
                <WorkspaceRow
                  key={w.id}
                  workspace={w}
                  expanded={expanded === w.id}
                  onToggle={() => setExpanded(expanded === w.id ? null : w.id)}
                  onSaved={() => {
                    void reload();
                    onChange();
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function WorkspaceRow({
  workspace: w,
  expanded,
  onToggle,
  onSaved,
}: {
  workspace: AdminWorkspace;
  expanded: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  return (
    <>
      <tr className={expanded ? 'is-selected' : ''}>
        <td>
          <strong>{w.name}</strong>
          <div className="small muted">{w.owner ?? 'No users'}</div>
          {w.referredBy && <div className="small muted">Referred by {w.referredBy}</div>}
        </td>
        <td>
          <div className="nowrap">{PLAN_NAMES[w.plan]}</div>
          {paid(w.plan) && <div className="small muted">Billed {cycle(w.billing)}</div>}
          {w.paidUntil && <div className="small muted">Paid until {day(w.paidUntil)}</div>}
          {w.plan === 'payg' && <div className="small muted">{w.credits} credits left</div>}
          {w.askedFor && (
            <span className="badge badge-warn admin-asked">
              Asked for {PLAN_NAMES[w.askedFor.plan as PlanId] ?? w.askedFor.plan}
              {paid(w.askedFor.plan) ? `, ${cycle(w.askedFor.billing)}` : ''}
            </span>
          )}
        </td>
        <td className="num">
          {w.reviewsThisMonth}
          {w.extrasThisMonth > 0 && <div className="small muted">{w.extrasThisMonth} extra</div>}
        </td>
        <td className="num">{w.bonusReviews}</td>
        <td className={`num ${w.locked > 0 ? 'admin-warn' : ''}`}>{w.locked}</td>
        <td className="num">{w.candidates}</td>
        <td className="num">{dollars(w.aiCostThisMonthUsd)}</td>
        <td className="nowrap small muted">{formatDate(w.lastActivity)}</td>
        <td>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onToggle} aria-expanded={expanded}>
            {expanded ? 'Close' : 'Manage'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="admin-manage-row">
          <td colSpan={9}>
            <ManageWorkspace workspace={w} onSaved={onSaved} />
          </td>
        </tr>
      )}
    </>
  );
}

const dateInput = (ts: number | null) => (ts ? new Date(ts).toISOString().slice(0, 10) : '');

function ManageWorkspace({ workspace: w, onSaved }: { workspace: AdminWorkspace; onSaved: () => void }) {
  const asked = w.askedFor && PLAN_IDS.includes(w.askedFor.plan as PlanId) ? (w.askedFor.plan as PlanId) : null;
  const [plan, setPlan] = useState<PlanId>(asked ?? w.plan);
  const [billing, setBilling] = useState<BillingCycle>(asked ? w.askedFor!.billing : w.billing);
  const [credits, setCredits] = useState(String(w.credits));
  const [paidUntil, setPaidUntil] = useState(dateInput(w.paidUntil));
  const [bonus, setBonus] = useState('10');
  const [busy, setBusy] = useState<'plan' | 'bonus' | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const started = (n: number) => (n ? ` ${n} waiting review${n === 1 ? '' : 's'} started.` : '');

  async function savePlan(event: FormEvent) {
    event.preventDefault();
    setBusy('plan');
    setError(null);
    setResult(null);
    try {
      const { unlocked } = await api.put<{ unlocked: number }>(`/api/admin/workspaces/${w.id}/plan`, {
        plan,
        billing: paid(plan) ? billing : 'monthly',
        credits: plan === 'payg' ? Number(credits) : null,
        paidUntil: paid(plan) && paidUntil ? Date.parse(`${paidUntil}T23:59:59Z`) : null,
      });
      setResult(`${w.name} is now on ${PLAN_NAMES[plan]}.${started(unlocked)}`);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function addBonus(event: FormEvent) {
    event.preventDefault();
    setBusy('bonus');
    setError(null);
    setResult(null);
    try {
      const { unlocked } = await api.post<{ unlocked: number }>(`/api/admin/workspaces/${w.id}/bonus`, {
        reviews: Number(bonus),
      });
      setResult(`Added ${bonus} free reviews to ${w.name}.${started(unlocked)}`);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-manage">
      <form className="admin-manage-block" onSubmit={savePlan}>
        <h3>Plan and billing</h3>
        {w.askedFor && (
          <p className="small muted">
            Asked for {PLAN_NAMES[w.askedFor.plan as PlanId] ?? w.askedFor.plan}
            {paid(w.askedFor.plan) ? ` billed ${cycle(w.askedFor.billing)}` : ''} on {day(w.askedFor.createdAt)}. Saving
            any plan marks the request as handled.
          </p>
        )}
        <div className="admin-fields">
          <label className="field">
            <span>Plan</span>
            <select value={plan} onChange={(e) => setPlan(e.target.value as PlanId)}>
              {PLAN_IDS.map((id) => (
                <option key={id} value={id}>
                  {PLAN_NAMES[id]}
                </option>
              ))}
            </select>
          </label>
          {paid(plan) && (
            <>
              <div className="field">
                <span>Billing</span>
                <div className="segmented" role="radiogroup" aria-label="Billing">
                  {(['monthly', 'annual'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={billing === c}
                      className={billing === c ? 'active' : ''}
                      onClick={() => setBilling(c)}
                    >
                      {c === 'annual' ? 'Yearly' : 'Monthly'}
                    </button>
                  ))}
                </div>
              </div>
              <label className="field">
                <span>Paid until</span>
                <input type="date" value={paidUntil} onChange={(e) => setPaidUntil(e.target.value)} />
              </label>
            </>
          )}
          {plan === 'payg' && (
            <label className="field">
              <span>Review credits</span>
              <input
                type="number"
                min={0}
                max={100000}
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                required
              />
            </label>
          )}
        </div>
        <button className="btn btn-primary btn-sm" disabled={busy !== null}>
          {busy === 'plan' ? 'Saving…' : 'Save plan'}
        </button>
      </form>
      <form className="admin-manage-block" onSubmit={addBonus}>
        <h3>Free reviews</h3>
        <p className="small muted">Used after the plan’s own reviews run out. {w.bonusReviews} left now.</p>
        <div className="admin-fields">
          <label className="field">
            <span>Reviews to add</span>
            <input type="number" min={1} max={1000} value={bonus} onChange={(e) => setBonus(e.target.value)} required />
          </label>
        </div>
        <button className="btn btn-secondary btn-sm" disabled={busy !== null}>
          {busy === 'bonus' ? 'Adding…' : 'Add free reviews'}
        </button>
      </form>
      <div className="admin-manage-foot">
        {result && (
          <p className="admin-result">
            <Icon name="check" size={14} /> {result}
          </p>
        )}
        <ErrorNote error={error} />
      </div>
    </div>
  );
}

// Plan requests ------------------------------------------------------------------------

function Requests({ open }: { open: (tab: Tab, extra?: Record<string, string>) => void }) {
  const { data, error } = useApi<{ requests: AdminRequest[] }>('/api/admin/requests');
  if (error) return <ErrorNote error={error} />;
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <section className="card flush">
      {data.requests.length === 0 ? (
        <p className="muted small padded">No one has asked to change plans yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="list-table admin-table">
            <thead>
              <tr>
                <th>Asked</th>
                <th>Workspace</th>
                <th>Asked for</th>
                <th>Note</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.requests.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap small muted">{formatDate(r.createdAt)}</td>
                  <td>
                    <strong>{r.workspace}</strong>
                    <div className="small muted">{r.email}</div>
                  </td>
                  <td className="nowrap">
                    {PLAN_NAMES[r.plan as PlanId] ?? r.plan}
                    {paid(r.plan) && <div className="small muted">Billed {cycle(r.billing)}</div>}
                  </td>
                  <td className="small admin-note">{r.note || <span className="muted">—</span>}</td>
                  <td className="nowrap">
                    {r.handledAt ? (
                      <span className="small muted">Handled {formatDate(r.handledAt)}</span>
                    ) : (
                      <span className="badge badge-warn">Open</span>
                    )}
                  </td>
                  <td>
                    {!r.handledAt && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => open('workspaces', { open: r.orgId })}
                      >
                        Set plan
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Leads ----------------------------------------------------------------------------------

function Leads() {
  const { data, error } = useApi<{ leads: AdminLead[] }>('/api/admin/leads');
  const [copied, setCopied] = useState(false);
  if (error) return <ErrorNote error={error} />;
  if (!data) return <p className="muted">Loading…</p>;
  const download = () => {
    const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
    const csv = [
      'email,source,date',
      ...data.leads.map((l) => [l.email, l.source, new Date(l.createdAt).toISOString()].map(quote).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([`${csv}\n`], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'proofwork-leads.csv';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="card flush">
      <div className="admin-toolbar padded">
        <span className="small muted">
          People who left their email at the end of the demo tour. {data.leads.length} in total.
        </span>
        {data.leads.length > 0 && (
          <div className="row-gap">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                void navigator.clipboard?.writeText(data.leads.map((l) => l.email).join(', '));
                setCopied(true);
              }}
            >
              <Icon name="copy" size={14} /> {copied ? 'Copied' : 'Copy emails'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={download}>
              Download CSV
            </button>
          </div>
        )}
      </div>
      {data.leads.length === 0 ? (
        <p className="muted small padded">No leads yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="list-table admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>From</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.leads.map((l) => (
                <tr key={`${l.email}-${l.createdAt}`}>
                  <td>
                    <a href={`mailto:${l.email}`}>{l.email}</a>
                  </td>
                  <td className="small">{l.source === 'candidate-tour' ? 'Candidate tour' : 'Recruiter tour'}</td>
                  <td className="nowrap small muted">{formatDate(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Errors ---------------------------------------------------------------------------------

function Errors() {
  const { data, error } = useApi<{ errors: AdminError[] }>('/api/admin/errors');
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (error) return <ErrorNote error={error} />;
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <section className="card flush">
      <p className="small muted padded admin-intro">
        Server errors and errors from people’s browsers in the last 30 days, grouped by message.
      </p>
      {data.errors.length === 0 ? (
        <p className="muted small padded">No errors. </p>
      ) : (
        <div className="table-scroll">
          <table className="list-table admin-table">
            <thead>
              <tr>
                <th>Error</th>
                <th>Where</th>
                <th className="num">Times</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {data.errors.map((e) => {
                const key = `${e.source}:${e.message}`;
                return (
                  <tr key={key}>
                    <td className="admin-error">
                      <button
                        type="button"
                        className="link-button admin-error-message"
                        onClick={() => setOpenKey(openKey === key ? null : key)}
                        aria-expanded={openKey === key}
                      >
                        {e.message}
                      </button>
                      {e.path && <div className="small muted">{e.path}</div>}
                      {openKey === key && e.detail && <pre className="admin-detail">{e.detail}</pre>}
                    </td>
                    <td className="small nowrap">{e.source === 'browser' ? 'Browser' : 'Server'}</td>
                    <td className="num">{e.count}</td>
                    <td className="nowrap small muted">{formatDate(e.lastSeen)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Activity -------------------------------------------------------------------------------

function Activity() {
  const { data, error } = useApi<{ events: AdminActivity[] }>('/api/admin/activity');
  if (error) return <ErrorNote error={error} />;
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <section className="card flush">
      <p className="small muted padded admin-intro">
        The latest 300 sign-ins, security changes and actions across every workspace.
      </p>
      {data.events.length === 0 ? (
        <p className="muted small padded">Nothing yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="list-table admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Workspace</th>
                <th>Who</th>
                <th>What</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap small muted">{formatDate(e.createdAt)}</td>
                  <td className="small">{e.workspace ?? <span className="muted">—</span>}</td>
                  <td className="small">{e.actor}</td>
                  <td>
                    {e.action}
                    {e.target && <strong> {e.target}</strong>}
                    {e.detail && <span className="small muted"> · {e.detail}</span>}
                  </td>
                  <td className="small muted nowrap">{e.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Backups ---------------------------------------------------------------------------------

function Backups() {
  const { data, error } = useApi<{ backups: string[] }>('/api/admin/backups');
  if (error) return <ErrorNote error={error} />;
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <section className="card flush">
      <p className="small muted padded admin-intro">
        A copy of the database is saved every night at 02:17 UTC and kept for 14 days. To restore one, load it into a
        new, empty database with <code>npm run admin -- restore &lt;file&gt;</code>.
      </p>
      {data.backups.length === 0 ? (
        <p className="muted small padded">No backups yet. The first one is made tonight.</p>
      ) : (
        <ul className="admin-backups">
          {data.backups.map((key) => (
            <li key={key}>
              <span>
                <Icon name="file" size={15} /> {day(Date.parse(`${key.slice(0, 10)}T12:00:00Z`))}
              </span>
              <a className="btn btn-secondary btn-sm" href={`/api/admin/backups/${key}`} download>
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
