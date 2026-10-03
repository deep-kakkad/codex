import { type ReactNode, useMemo, useState } from 'react';
import type { RoleFamilySummary } from '../../../shared/api';
import { INDUSTRIES, JOB_FUNCTIONS, SENIORITIES, SKILLS } from '../../../shared/catalog';
import { Icon } from './Icon';

const CUSTOM = 'Written for you';
const LENGTHS = [
  { id: 'short', label: 'Under 30 min', test: (m: number) => m < 30 },
  { id: 'mid', label: '30–45 min', test: (m: number) => m >= 30 && m <= 45 },
  { id: 'long', label: 'Over 45 min', test: (m: number) => m > 45 },
] as const;

interface Filters {
  query: string;
  fn: string;
  seniority: string;
  industry: string;
  skill: string;
  length: string;
}

const EMPTY: Filters = { query: '', fn: '', seniority: '', industry: '', skill: '', length: '' };

const functionOf = (f: RoleFamilySummary) => f.catalog?.function ?? CUSTOM;

function matches(f: RoleFamilySummary, filters: Filters, skipFunction = false) {
  const c = f.catalog;
  if (!skipFunction && filters.fn && functionOf(f) !== filters.fn) return false;
  if (filters.seniority && !c?.seniority.includes(filters.seniority as never)) return false;
  if (filters.industry && !c?.industries.includes(filters.industry as never) && !c?.industries.includes('Any'))
    return false;
  if (filters.skill && !c?.skills.includes(filters.skill as never)) return false;
  if (filters.length && !LENGTHS.find((l) => l.id === filters.length)?.test(f.totalMinutes)) return false;
  const q = filters.query.trim().toLowerCase();
  if (q) {
    const haystack = [f.name, f.summary, ...f.roles, ...(c?.keywords ?? []), c?.function ?? ''].join(' ').toLowerCase();
    if (!q.split(/\s+/).every((word) => haystack.includes(word))) return false;
  }
  return true;
}

/**
 * The role library as a searchable, filterable catalogue. `action` renders
 * what a card offers (choose it, or preview it); `selectedId` highlights one.
 */
export function RoleCatalog({
  families,
  action,
  selectedId,
  onSelect,
  empty,
}: {
  families: RoleFamilySummary[];
  action: (family: RoleFamilySummary) => ReactNode;
  selectedId?: string | null;
  onSelect?: (family: RoleFamilySummary) => void;
  empty?: ReactNode;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const set = (key: keyof Filters) => (value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const shown = families.filter((f) => matches(f, filters));
  // Function tabs count what the other filters leave, so a tab never promises roles it can't show.
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of families) {
      if (!matches(f, filters, true)) continue;
      map.set(functionOf(f), (map.get(functionOf(f)) ?? 0) + 1);
    }
    return map;
  }, [families, filters]);
  const tabs = [...JOB_FUNCTIONS, CUSTOM].filter((fn) => families.some((f) => functionOf(f) === fn));
  const filtered = Object.entries(filters).some(([, v]) => v);

  return (
    <div className="catalog">
      <div className="catalog-search">
        <Icon name="library" size={16} />
        <input
          type="search"
          value={filters.query}
          onChange={(e) => set('query')(e.target.value)}
          placeholder="Search roles, e.g. SDR, product manager, accountant…"
          aria-label="Search roles"
        />
      </div>

      <div className="catalog-tabs" role="tablist" aria-label="Function">
        <button
          role="tab"
          aria-selected={!filters.fn}
          className={!filters.fn ? 'is-on' : ''}
          onClick={() => set('fn')('')}
        >
          All <span className="num">{[...counts.values()].reduce((a, b) => a + b, 0)}</span>
        </button>
        {tabs.map((fn) => (
          <button
            key={fn}
            role="tab"
            aria-selected={filters.fn === fn}
            className={filters.fn === fn ? 'is-on' : ''}
            onClick={() => set('fn')(filters.fn === fn ? '' : fn)}
            disabled={!counts.get(fn) && filters.fn !== fn}
          >
            {fn} <span className="num">{counts.get(fn) ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="catalog-filters">
        <FilterSelect label="Seniority" value={filters.seniority} options={SENIORITIES} onChange={set('seniority')} />
        <FilterSelect
          label="Industry"
          value={filters.industry}
          options={INDUSTRIES.filter((i) => i !== 'Any')}
          onChange={set('industry')}
        />
        <FilterSelect label="Tests" value={filters.skill} options={SKILLS} onChange={set('skill')} />
        <FilterSelect
          label="Length"
          value={filters.length}
          options={LENGTHS.map((l) => l.id)}
          labels={Object.fromEntries(LENGTHS.map((l) => [l.id, l.label]))}
          onChange={set('length')}
        />
        <span className="catalog-count">
          {shown.length} role{shown.length === 1 ? '' : 's'}
          {filtered && (
            <button type="button" className="px-link" onClick={() => setFilters(EMPTY)}>
              Clear filters
            </button>
          )}
        </span>
      </div>

      {shown.length === 0 ? (
        <div className="catalog-empty">{empty ?? <p className="muted">No roles match these filters.</p>}</div>
      ) : (
        <div className="catalog-grid">
          {shown.map((f) => (
            <article
              key={f.id}
              className={`card catalog-card ${selectedId === f.id ? 'selected' : ''} ${onSelect ? 'is-selectable' : ''}`}
              onClick={onSelect ? () => onSelect(f) : undefined}
            >
              <div className="catalog-card-top">
                <span className="catalog-fn">{functionOf(f)}</span>
                <span className="catalog-min">
                  <Icon name="clock" size={13} /> {f.totalMinutes} min
                </span>
              </div>
              <h3>{f.name}</h3>
              <p className="catalog-summary">{f.summary}</p>
              <p className="catalog-roles">For: {f.roles.join(', ')}</p>
              {f.catalog && (
                <div className="catalog-tags">
                  {f.catalog.seniority.length > 0 && (
                    <span className="catalog-tag is-level">{f.catalog.seniority.join(' · ')}</span>
                  )}
                  {f.catalog.skills.slice(0, 3).map((skill) => (
                    <span key={skill} className="catalog-tag">
                      {skill}
                    </span>
                  ))}
                </div>
              )}
              <div className="catalog-actions" onClick={(e) => e.stopPropagation()}>
                {action(f)}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`catalog-select ${value ? 'is-set' : ''}`}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{label}: any</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {labels?.[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  );
}
