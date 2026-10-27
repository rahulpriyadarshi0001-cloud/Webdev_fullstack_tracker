import { useState, useEffect, useRef } from 'react';
import {
  Flame, Zap, Plus, Minus, ChevronRight, RotateCcw, Settings, X, Check,
  Code2, Layers, ListChecks,  Database, Pencil, Trash2, Home as HomeIcon,
  Folder, ExternalLink, StickyNote, BookOpen, RefreshCw, AlertCircle,
} from 'lucide-react';

const STORAGE_KEY = 'placement-console-v1';

/* ---------- colors (raw hex \u2014 needed wherever we append alpha suffixes) ---------- */
const C = { accent: '#E8A33D', accent2: '#4FD1E8', success: '#5FD98A', danger: '#F1615A' };

/* ---------- helpers ---------- */
const uid = () => Math.random().toString(36).slice(2, 10);
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDaysStr = (dateStr, delta) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const fmtDateLabel = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);

const computeStreak = (activityLog) => {
  const dates = Object.keys(activityLog || {});
  if (dates.length === 0) return 0;
  let cursor = todayStr();
  if (!activityLog[cursor]) cursor = addDaysStr(cursor, -1);
  let streak = 0;
  while (activityLog[cursor]) {
    streak += 1;
    cursor = addDaysStr(cursor, -1);
  }
  return streak;
};

const HONESTY = {
  independent: { label: 'Solved independently', dot: C.success },
  verified: { label: 'Struggled, then verified', dot: C.accent },
  copied: { label: 'Looked up & copied', dot: C.danger },
};

/* ---------- simplified revision logic: last-touched + interval-by-confidence ---------- */
const REVISION_INTERVAL = { weak: 3, ok: 7, strong: 14 };
const getRevisionInfo = (topic) => {
  if (!topic.solved || topic.solved === 0) return { state: 'none' };
  const interval = REVISION_INTERVAL[topic.confidence] || 7;
  if (!topic.lastRevised) return { state: 'due', overdueBy: null, interval };
  const since = daysBetween(topic.lastRevised, todayStr());
  if (since >= interval) return { state: 'due', overdueBy: since - interval, interval };
  return { state: 'upcoming', dueIn: interval - since, interval };
};
const markTopicRevised = (setState, id) =>
  setState((s) => ({ ...s, dsaTopics: s.dsaTopics.map((t) => (t.id === id ? { ...t, lastRevised: todayStr() } : t)) }));

const NOTE_CATEGORIES = ['DSA', 'Web Dev', 'SQL', 'Interview', 'General'];
const PROJECT_STATUSES = ['Planning', 'Building', 'Polishing', 'Shipped'];

/* ---------- default state ---------- */
const DEFAULT_STATE = {
  targetDate: addDaysStr(todayStr(), 150),
  xp: 0,
  activityLog: {},
  tasks: [
    { id: uid(), text: 'Re-solve one stack problem from memory', done: false },
    { id: uid(), text: '20 min SQL basics', done: false },
  ],
  dsaTopics: [
    { id: uid(), name: 'Learn the Basics', solved: 5, total: 54, confidence: 'ok', lastRevised: null },
    { id: uid(), name: 'Sorting Techniques', solved: 0, total: 7, confidence: 'weak', lastRevised: null },
    { id: uid(), name: 'Arrays [Easy\u2192Med\u2192Hard]', solved: 20, total: 40, confidence: 'ok', lastRevised: null },
    { id: uid(), name: 'Binary Search', solved: 25, total: 32, confidence: 'strong', lastRevised: null },
    { id: uid(), name: 'Strings', solved: 14, total: 15, confidence: 'strong', lastRevised: null },
    { id: uid(), name: 'LinkedList', solved: 21, total: 31, confidence: 'ok', lastRevised: null },
    { id: uid(), name: 'Recursion [PatternWise]', solved: 4, total: 25, confidence: 'weak', lastRevised: null },
    { id: uid(), name: 'Bit Manipulation', solved: 0, total: 18, confidence: 'weak', lastRevised: null },
  ],
  webdevPhase1: {
    label: 'Phase 1 \u2014 Foundations \u00b7 Day 1\u201315',
    days: [
      'Dev Environment Setup', 'Git & GitHub Fundamentals', 'HTML Structure & Semantics',
      'HTML Forms & Validation', 'CSS Fundamentals', 'CSS Flexbox', 'CSS Grid',
      'Responsive Design & Media Queries', 'CSS Variables & Custom Properties',
      'CSS Animations & Transitions', 'Typography & Color Theory',
      'Project Day \u2014 Personal Landing Page', 'Git Branching & Collaboration',
      'Tailwind CSS Intro', 'Deploy to Production',
    ].map((t, i) => ({ id: uid(), day: i + 1, title: t, done: true })),
  },
  webdevPhase2: {
    label: 'Phase 2 \u2014 JavaScript Fundamentals \u00b7 Day 16\u201330',
    days: [
      'JS Foundations: Types & Variables', 'Functions, Scope & Closures',
      'Arrays & Higher-Order Functions', 'Objects, Destructuring & Spread',
      'DOM Manipulation', 'Events & Forms with JS',
    ].map((t, i) => ({ id: uid(), day: i + 16, title: t, done: false })),
  },
  sqlStages: [
    { id: uid(), name: 'Basics \u2014 SELECT / WHERE', done: false },
    { id: uid(), name: 'JOINs', done: false },
    { id: uid(), name: 'GROUP BY / Aggregations', done: false },
  ],
  projects: [],
  notes: [],
  resources: [],
};

/* backfills any state saved before Phase 2 so nothing crashes on old data */
const hydrateState = (loaded) => {
  const merged = { ...DEFAULT_STATE, ...loaded };
  merged.dsaTopics = (loaded.dsaTopics && loaded.dsaTopics.length ? loaded.dsaTopics : DEFAULT_STATE.dsaTopics).map((t) => ({ lastRevised: null, ...t }));
  merged.projects = loaded.projects || [];
  merged.notes = loaded.notes || [];
  merged.resources = loaded.resources || [];
  merged.tasks = loaded.tasks || DEFAULT_STATE.tasks;
  merged.activityLog = loaded.activityLog || {};
  merged.webdevPhase1 = loaded.webdevPhase1 || DEFAULT_STATE.webdevPhase1;
  merged.webdevPhase2 = loaded.webdevPhase2 || DEFAULT_STATE.webdevPhase2;
  merged.sqlStages = loaded.sqlStages || DEFAULT_STATE.sqlStages;
  return merged;
};

/* ---------- tiny inline formatter: **bold** and `code`, nothing else ---------- */
const renderInline = (line) => {
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = [];
  let lastIndex = 0, m, idx = 0;
  while ((m = regex.exec(line)) !== null) {
    if (m.index > lastIndex) parts.push(<span key={idx++}>{line.slice(lastIndex, m.index)}</span>);
    const tok = m[0];
    if (tok.startsWith('**')) parts.push(<strong key={idx++}>{tok.slice(2, -2)}</strong>);
    else parts.push(<code key={idx++} className="inline-code">{tok.slice(1, -1)}</code>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < line.length) parts.push(<span key={idx++}>{line.slice(lastIndex)}</span>);
  return parts;
};
const renderBody = (text) => text.split('\n').map((line, i) => <div key={i}>{line ? renderInline(line) : '\u00a0'}</div>);

/* ---------- small UI atoms ---------- */
function Gauge({ percent, sublabel, color = 'var(--accent)', size = 172 }) {
  const r = size / 2 - 16;
  const cx = size / 2, cy = size / 2;
  const start = 135, sweep = 270;
  const toXY = (angleDeg, radius) => {
    const rad = (angleDeg * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
  };
  const arcPath = (fromDeg, toDeg, radius) => {
    const [x1, y1] = toXY(fromDeg, radius);
    const [x2, y2] = toXY(toDeg, radius);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
  };
  const pct = clamp(percent, 0, 100);
  const endAngle = start + (pct / 100) * sweep;
  const ticks = Array.from({ length: 11 }, (_, i) => start + (i / 10) * sweep);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <path d={arcPath(start, start + sweep, r)} stroke="var(--track)" strokeWidth="10" fill="none" strokeLinecap="round" />
      {ticks.map((a, i) => {
        const [x1, y1] = toXY(a, r - 15);
        const [x2, y2] = toXY(a, r - 9);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--tick)" strokeWidth="2" />;
      })}
      {pct > 0 && (
        <path
          d={arcPath(start, endAngle, r)}
          stroke={color}
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 5px ${color})` }}
        />
      )}
      <text x={cx} y={cy - 2} textAnchor="middle" fill="var(--text)" style={{ fontFamily: 'var(--font-mono)', fontSize: size * 0.185, fontWeight: 600 }}>
        {Math.round(pct)}%
      </text>
      <text x={cx} y={cy + 22} textAnchor="middle" fill="var(--text-dim)" style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {sublabel}
      </text>
    </svg>
  );
}

function ConfidencePill({ level, onClick }) {
  const meta = { weak: { t: 'WEAK', c: C.danger }, ok: { t: 'OK', c: C.accent }, strong: { t: 'STRONG', c: C.success } }[level];
  return (
    <button onClick={onClick} className="pill" style={{ color: meta.c, borderColor: meta.c + '55', background: meta.c + '14' }}>
      <span className="pill-dot" style={{ background: meta.c }} />
      {meta.t}
    </button>
  );
}

function IconBtn({ onClick, children, title }) {
  return (
    <button onClick={onClick} title={title} className="icon-btn">
      {children}
    </button>
  );
}

function AddRow({ placeholder, withTotal, onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [total, setTotal] = useState('');

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="add-row-trigger">
        <Plus size={14} /> {placeholder}
      </button>
    );
  }
  return (
    <div className="add-row-open">
      <input
        autoFocus
        className="input"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ flex: 1 }}
      />
      {withTotal && (
        <input
          className="input"
          placeholder="Total"
          type="number"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          style={{ width: 72 }}
        />
      )}
      <IconBtn
        title="Add"
        onClick={() => {
          if (!name.trim()) return;
          onAdd(name.trim(), Number(total) || 0);
          setName(''); setTotal(''); setOpen(false);
        }}
      >
        <Check size={15} />
      </IconBtn>
      <IconBtn title="Cancel" onClick={() => { setOpen(false); setName(''); setTotal(''); }}>
        <X size={15} />
      </IconBtn>
    </div>
  );
}

function RevisionLine({ topic, onMarkRevised }) {
  const info = getRevisionInfo(topic);
  if (info.state === 'none') return null;
  return (
    <div className="revision-line">
      <span className={info.state === 'due' ? 'revision-due-text' : 'revision-ok-text'}>
        {info.state === 'due'
          ? topic.lastRevised ? `Due \u00b7 ${info.overdueBy}d overdue` : 'Never revised \u2014 due now'
          : `Next revision in ${info.dueIn}d`}
      </span>
      <button className="icon-btn" title="Mark revised today" onClick={onMarkRevised}>
        <RefreshCw size={12} />
      </button>
    </div>
  );
}

/* ---------- tabs ---------- */
function DueForRevisionWidget({ state, setState }) {
  const due = state.dsaTopics
    .map((t) => ({ topic: t, info: getRevisionInfo(t) }))
    .filter((x) => x.info.state === 'due')
    .sort((a, b) => (b.info.overdueBy || 999) - (a.info.overdueBy || 999));

  return (
    <div className="panel">
      <div className="section-title flex items-center gap-2"><AlertCircle size={15} /> Due for revision</div>
      <div className="space-y-1.5 mt-3">
        {due.length === 0 && <div className="empty-hint">Nothing overdue \u2014 you're caught up.</div>}
        {due.slice(0, 5).map(({ topic, info }) => (
          <div key={topic.id} className="task-row" style={{ justifyContent: 'space-between' }}>
            <span className="task-text">{topic.name}</span>
            <div className="flex items-center gap-2">
              <span className="revision-due-text" style={{ fontSize: 11 }}>
                {topic.lastRevised ? `${info.overdueBy}d overdue` : 'never revised'}
              </span>
              <IconBtn title="Mark revised" onClick={() => markTopicRevised(setState, topic.id)}><RefreshCw size={12} /></IconBtn>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HomeTab({ state, setState, overallPct, dsaPct, webdevPct, streak, level }) {
  const daysLeft = Math.ceil((new Date(state.targetDate + 'T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 86400000);
  const last14 = Array.from({ length: 14 }, (_, i) => addDaysStr(todayStr(), -(13 - i)));

  const toggleTask = (id) =>
    setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="panel flex flex-col items-center py-5">
          <Gauge percent={overallPct} sublabel="Overall" color="var(--accent)" />
        </div>
        <div className="panel flex flex-col items-center py-5">
          <Gauge percent={dsaPct} sublabel="DSA" color="var(--accent)" />
        </div>
        <div className="panel flex flex-col items-center py-5">
          <Gauge percent={webdevPct} sublabel="Web Dev" color="var(--accent-2)" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="panel-flat">
          <div className="stat-label">Days to target</div>
          <div className="stat-value">{Number.isFinite(daysLeft) ? Math.max(daysLeft, 0) : '\u2014'}</div>
        </div>
        <div className="panel-flat">
          <div className="stat-label flex items-center gap-1.5"><Flame size={12} /> Streak</div>
          <div className="stat-value">{streak}<span className="stat-unit">d</span></div>
        </div>
        <div className="panel-flat">
          <div className="stat-label flex items-center gap-1.5"><Zap size={12} /> Level</div>
          <div className="stat-value">{level}<span className="stat-unit"> \u00b7 {state.xp} XP</span></div>
        </div>
      </div>

      <div className="panel">
        <div className="section-title">Today's tasks</div>
        <div className="space-y-1.5 mt-3">
          {state.tasks.length === 0 && <div className="empty-hint">No tasks queued. Add one from the Planner tab.</div>}
          {state.tasks.slice(0, 6).map((t) => (
            <label key={t.id} className="task-row">
              <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id)} className="checkbox" />
              <span className={t.done ? 'task-text-done' : 'task-text'}>{t.text}</span>
            </label>
          ))}
        </div>
      </div>

      <DueForRevisionWidget state={state} setState={setState} />

      <div className="panel">
        <div className="section-title">Last 14 days</div>
        <div className="flex gap-1.5 mt-3">
          {last14.map((d) => {
            const entry = state.activityLog[d];
            const color = entry ? HONESTY[entry.honesty]?.dot || C.success : 'var(--track)';
            return <div key={d} title={`${fmtDateLabel(d)}${entry ? ' \u2014 ' + (HONESTY[entry.honesty]?.label || '') : ''}`} className="heat-cell" style={{ background: color }} />;
          })}
        </div>
      </div>
    </div>
  );
}

function DsaTab({ state, setState }) {
  const updateSolved = (id, delta) =>
    setState((s) => ({
      ...s,
      dsaTopics: s.dsaTopics.map((t) => (t.id === id ? { ...t, solved: clamp(t.solved + delta, 0, t.total || 9999) } : t)),
    }));
  const cycleConfidence = (id) =>
    setState((s) => ({
      ...s,
      dsaTopics: s.dsaTopics.map((t) => {
        if (t.id !== id) return t;
        const order = ['weak', 'ok', 'strong'];
        return { ...t, confidence: order[(order.indexOf(t.confidence) + 1) % 3] };
      }),
    }));
  const removeTopic = (id) => setState((s) => ({ ...s, dsaTopics: s.dsaTopics.filter((t) => t.id !== id) }));
  const addTopic = (name, total) => setState((s) => ({ ...s, dsaTopics: [...s.dsaTopics, { id: uid(), name, solved: 0, total, confidence: 'weak', lastRevised: null }] }));

  return (
    <div className="panel">
      <div className="flex items-center justify-between">
        <div className="section-title flex items-center gap-2"><Code2 size={15} /> DSA \u2014 Striver A2Z Sheet</div>
      </div>
      <div className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>Seeded from your last sheet screenshot. Add Stack &amp; Queue, Trees, Graphs, DP as you reach them.</div>

      <div className="space-y-3 mt-4">
        {state.dsaTopics.map((t) => {
          const pct = t.total > 0 ? clamp((t.solved / t.total) * 100, 0, 100) : 0;
          return (
            <div key={t.id} className="topic-row">
              <div className="flex items-center justify-between">
                <div className="topic-name">{t.name}</div>
                <div className="flex items-center gap-2">
                  <ConfidencePill level={t.confidence} onClick={() => cycleConfidence(t.id)} />
                  <IconBtn title="Remove" onClick={() => removeTopic(t.id)}><Trash2 size={13} /></IconBtn>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <div className="track-bg" style={{ flex: 1 }}>
                  <div className="track-fill" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
                </div>
                <div className="mono-readout">{t.solved}/{t.total}</div>
                <div className="flex items-center gap-1">
                  <IconBtn title="-1" onClick={() => updateSolved(t.id, -1)}><Minus size={13} /></IconBtn>
                  <IconBtn title="+1" onClick={() => updateSolved(t.id, 1)}><Plus size={13} /></IconBtn>
                </div>
              </div>
              <RevisionLine topic={t} onMarkRevised={() => markTopicRevised(setState, t.id)} />
            </div>
          );
        })}
      </div>

      <div className="mt-3">
        <AddRow placeholder="Add topic (e.g. Stack & Queue)" withTotal onAdd={addTopic} />
      </div>
    </div>
  );
}

function WebDevTab({ state, setState }) {
  const toggleDay = (phaseKey, id) =>
    setState((s) => ({
      ...s,
      [phaseKey]: { ...s[phaseKey], days: s[phaseKey].days.map((d) => (d.id === id ? { ...d, done: !d.done } : d)) },
    }));
  const addPhase2Day = (title) =>
    setState((s) => ({
      ...s,
      webdevPhase2: {
        ...s.webdevPhase2,
        days: [...s.webdevPhase2.days, { id: uid(), day: s.webdevPhase2.days.length + 16, title, done: false }],
      },
    }));
  const toggleSql = (id) =>
    setState((s) => ({ ...s, sqlStages: s.sqlStages.map((st) => (st.id === id ? { ...st, done: !st.done } : st)) }));

  const PhaseBlock = ({ phaseKey, phase }) => (
    <div className="panel">
      <div className="section-title flex items-center gap-2"><Layers size={15} /> {phase.label}</div>
      <div className="space-y-1.5 mt-3">
        {phase.days.map((d) => (
          <label key={d.id} className="task-row">
            <input type="checkbox" checked={d.done} onChange={() => toggleDay(phaseKey, d.id)} className="checkbox" />
            <span className="day-num">Day {d.day}</span>
            <span className={d.done ? 'task-text-done' : 'task-text'}>{d.title}</span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <PhaseBlock phaseKey="webdevPhase1" phase={state.webdevPhase1} />
      <PhaseBlock phaseKey="webdevPhase2" phase={state.webdevPhase2} />
      <div className="panel">
        <div className="text-xs" style={{ color: 'var(--text-dim)' }}>Beyond Day 21, add lessons as your playlist (Chai aur Code / CodeWithHarry) reveals them \u2014 titles aren't fixed to a fake schedule.</div>
        <div className="mt-3"><AddRow placeholder="Add next lesson" onAdd={addPhase2Day} /></div>
      </div>
      <div className="panel">
        <div className="section-title flex items-center gap-2"><Database size={15} /> SQL</div>
        <div className="space-y-1.5 mt-3">
          {state.sqlStages.map((st) => (
            <label key={st.id} className="task-row">
              <input type="checkbox" checked={st.done} onChange={() => toggleSql(st.id)} className="checkbox" />
              <span className={st.done ? 'task-text-done' : 'task-text'}>{st.name}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProjectsTab({ state, setState }) {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: '', stack: '', difficulty: 'Medium', github: '', live: '', notes: '' });

  const addProject = () => {
    if (!form.name.trim()) return;
    setState((s) => ({
      ...s,
      projects: [
        ...s.projects,
        {
          id: uid(),
          name: form.name.trim(),
          stack: form.stack.split(',').map((x) => x.trim()).filter(Boolean),
          difficulty: form.difficulty,
          status: 'Planning',
          github: form.github.trim(),
          live: form.live.trim(),
          notes: form.notes.trim(),
        },
      ],
    }));
    setForm({ name: '', stack: '', difficulty: 'Medium', github: '', live: '', notes: '' });
    setFormOpen(false);
  };

  const cycleStatus = (id) =>
    setState((s) => ({
      ...s,
      projects: s.projects.map((p) => {
        if (p.id !== id) return p;
        const i = PROJECT_STATUSES.indexOf(p.status);
        return { ...p, status: PROJECT_STATUSES[(i + 1) % PROJECT_STATUSES.length] };
      }),
    }));
  const updateNotes = (id, notes) => setState((s) => ({ ...s, projects: s.projects.map((p) => (p.id === id ? { ...p, notes } : p)) }));
  const removeProject = (id) => setState((s) => ({ ...s, projects: s.projects.filter((p) => p.id !== id) }));

  return (
    <div className="space-y-4">
      <div className="panel">
        <div className="section-title flex items-center gap-2"><Folder size={15} /> Projects</div>
        <div className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>Your resume already has the robot, greenhouse monitor, and DevPath \u2014 track what you build next here.</div>

        {!formOpen ? (
          <button onClick={() => setFormOpen(true)} className="add-row-trigger mt-3"><Plus size={14} /> Add a project</button>
        ) : (
          <div className="project-form mt-3">
            <input className="input" placeholder="Project name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={{ width: '100%' }} />
            <input className="input mt-2" placeholder="Tech stack (comma separated)" value={form.stack} onChange={(e) => setForm((f) => ({ ...f, stack: e.target.value }))} style={{ width: '100%' }} />
            <div className="flex gap-2 mt-2">
              <select className="input" value={form.difficulty} onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))} style={{ flex: 1 }}>
                <option>Easy</option><option>Medium</option><option>Hard</option>
              </select>
              <input className="input" placeholder="GitHub link" value={form.github} onChange={(e) => setForm((f) => ({ ...f, github: e.target.value }))} style={{ flex: 1 }} />
            </div>
            <input className="input mt-2" placeholder="Live link (optional)" value={form.live} onChange={(e) => setForm((f) => ({ ...f, live: e.target.value }))} style={{ width: '100%' }} />
            <textarea className="input mt-2" placeholder="Notes" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} style={{ width: '100%', resize: 'vertical' }} />
            <div className="flex gap-2 mt-2">
              <button className="btn-primary" onClick={addProject}>Add project</button>
              <button className="btn-danger" onClick={() => setFormOpen(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {state.projects.length === 0 && (
        <div className="panel"><div className="empty-hint">No projects logged yet. Your web-dev roadmap has "Project #1" coming once Phase 2 wraps \u2014 add it here when you start.</div></div>
      )}

      {state.projects.map((p) => (
        <div key={p.id} className="panel">
          <div className="flex items-center justify-between">
            <div className="topic-name">{p.name}</div>
            <div className="flex items-center gap-2">
              <button className="pill" onClick={() => cycleStatus(p.id)} style={{ color: C.accent2, borderColor: C.accent2 + '55', background: C.accent2 + '14' }}>
                {p.status.toUpperCase()}
              </button>
              <IconBtn title="Remove" onClick={() => removeProject(p.id)}><Trash2 size={13} /></IconBtn>
            </div>
          </div>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {p.stack.map((s, i) => <span key={i} className="tag-chip">{s}</span>)}
            <span className="tag-chip">{p.difficulty}</span>
          </div>
          {(p.github || p.live) && (
            <div className="flex gap-3 mt-2">
              {p.github && <a href={p.github} target="_blank" rel="noopener noreferrer" className="resource-link"><Github size={12} /> Repo</a>}
              {p.live && <a href={p.live} target="_blank" rel="noopener noreferrer" className="resource-link"><ExternalLink size={12} /> Live</a>}
            </div>
          )}
          <textarea
            className="input mt-2"
            style={{ width: '100%', resize: 'vertical' }}
            rows={2}
            value={p.notes}
            placeholder="Notes / remaining work"
            onChange={(e) => updateNotes(p.id, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

function NotesTab({ state, setState }) {
  const [filter, setFilter] = useState('All');
  const [noteForm, setNoteForm] = useState({ title: '', category: 'General', body: '' });
  const [noteFormOpen, setNoteFormOpen] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState({});
  const [resForm, setResForm] = useState({ title: '', url: '', category: 'General' });
  const [resFormOpen, setResFormOpen] = useState(false);

  const addNote = () => {
    if (!noteForm.title.trim()) return;
    setState((s) => ({ ...s, notes: [{ id: uid(), ...noteForm, title: noteForm.title.trim(), updatedAt: todayStr() }, ...s.notes] }));
    setNoteForm({ title: '', category: 'General', body: '' });
    setNoteFormOpen(false);
  };
  const removeNote = (id) => setState((s) => ({ ...s, notes: s.notes.filter((n) => n.id !== id) }));

  const addResource = () => {
    if (!resForm.title.trim() || !resForm.url.trim()) return;
    setState((s) => ({ ...s, resources: [{ id: uid(), ...resForm, title: resForm.title.trim(), url: resForm.url.trim() }, ...s.resources] }));
    setResForm({ title: '', url: '', category: 'General' });
    setResFormOpen(false);
  };
  const removeResource = (id) => setState((s) => ({ ...s, resources: s.resources.filter((r) => r.id !== id) }));

  const filteredNotes = filter === 'All' ? state.notes : state.notes.filter((n) => n.category === filter);
  const filteredResources = filter === 'All' ? state.resources : state.resources.filter((r) => r.category === filter);

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {['All', ...NOTE_CATEGORIES].map((c) => (
          <button key={c} onClick={() => setFilter(c)} className={filter === c ? 'filter-chip filter-chip-active' : 'filter-chip'}>{c}</button>
        ))}
      </div>

      <div className="panel">
        <div className="section-title flex items-center gap-2"><StickyNote size={15} /> Notes</div>
        {!noteFormOpen ? (
          <button onClick={() => setNoteFormOpen(true)} className="add-row-trigger mt-3"><Plus size={14} /> Add a note</button>
        ) : (
          <div className="project-form mt-3">
            <input className="input" placeholder="Title" value={noteForm.title} onChange={(e) => setNoteForm((f) => ({ ...f, title: e.target.value }))} style={{ width: '100%' }} />
            <select className="input mt-2" value={noteForm.category} onChange={(e) => setNoteForm((f) => ({ ...f, category: e.target.value }))}>
              {NOTE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <textarea className="input mt-2" placeholder="Note (**bold**, `code` supported)" rows={4} value={noteForm.body} onChange={(e) => setNoteForm((f) => ({ ...f, body: e.target.value }))} style={{ width: '100%', resize: 'vertical' }} />
            <div className="flex gap-2 mt-2">
              <button className="btn-primary" onClick={addNote}>Save note</button>
              <button className="btn-danger" onClick={() => setNoteFormOpen(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-2 mt-3">
          {filteredNotes.length === 0 && <div className="empty-hint">No notes {filter !== 'All' ? `in ${filter}` : 'yet'}.</div>}
          {filteredNotes.map((n) => (
            <div key={n.id} className="note-card">
              <div className="flex items-center justify-between" style={{ cursor: 'pointer' }} onClick={() => setExpandedNotes((e) => ({ ...e, [n.id]: !e[n.id] }))}>
                <div className="flex items-center gap-2">
                  <span className="tag-chip">{n.category}</span>
                  <span className="topic-name" style={{ fontSize: 12.5 }}>{n.title}</span>
                </div>
                <IconBtn title="Delete" onClick={(e) => { e.stopPropagation(); removeNote(n.id); }}><Trash2 size={12} /></IconBtn>
              </div>
              {expandedNotes[n.id] && n.body && <div className="note-body">{renderBody(n.body)}</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="section-title flex items-center gap-2"><BookOpen size={15} /> Resources</div>
        {!resFormOpen ? (
          <button onClick={() => setResFormOpen(true)} className="add-row-trigger mt-3"><Plus size={14} /> Add a resource</button>
        ) : (
          <div className="project-form mt-3">
            <input className="input" placeholder="Title" value={resForm.title} onChange={(e) => setResForm((f) => ({ ...f, title: e.target.value }))} style={{ width: '100%' }} />
            <input className="input mt-2" placeholder="URL" value={resForm.url} onChange={(e) => setResForm((f) => ({ ...f, url: e.target.value }))} style={{ width: '100%' }} />
            <select className="input mt-2" value={resForm.category} onChange={(e) => setResForm((f) => ({ ...f, category: e.target.value }))}>
              {NOTE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <div className="flex gap-2 mt-2">
              <button className="btn-primary" onClick={addResource}>Save</button>
              <button className="btn-danger" onClick={() => setResFormOpen(false)}>Cancel</button>
            </div>
          </div>
        )}
        <div className="space-y-1.5 mt-3">
          {filteredResources.length === 0 && <div className="empty-hint">No resources {filter !== 'All' ? `in ${filter}` : 'saved yet'}.</div>}
          {filteredResources.map((r) => (
            <div key={r.id} className="task-row" style={{ justifyContent: 'space-between' }}>
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="resource-link">
                <ExternalLink size={12} /> {r.title}
              </a>
              <div className="flex items-center gap-2">
                <span className="tag-chip">{r.category}</span>
                <IconBtn title="Delete" onClick={() => removeResource(r.id)}><Trash2 size={12} /></IconBtn>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlannerTab({ state, setState }) {
  const [newTask, setNewTask] = useState('');
  const [note, setNote] = useState('');
  const [honesty, setHonesty] = useState('independent');
  const todayEntry = state.activityLog[todayStr()];

  const addTask = () => {
    if (!newTask.trim()) return;
    setState((s) => ({ ...s, tasks: [...s.tasks, { id: uid(), text: newTask.trim(), done: false }] }));
    setNewTask('');
  };
  const toggleTask = (id) => setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));
  const removeTask = (id) => setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));

  const submitLog = () => {
    setState((s) => ({
      ...s,
      xp: s.xp + 15,
      activityLog: { ...s.activityLog, [todayStr()]: { note: note.trim(), honesty, ts: Date.now() } },
    }));
    setNote('');
  };

  const recentDates = Object.keys(state.activityLog).sort().reverse().slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="panel">
        <div className="section-title flex items-center gap-2"><ListChecks size={15} /> Tasks</div>
        <div className="space-y-1.5 mt-3">
          {state.tasks.map((t) => (
            <div key={t.id} className="task-row">
              <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id)} className="checkbox" />
              <span className={t.done ? 'task-text-done' : 'task-text'} style={{ flex: 1 }}>{t.text}</span>
              <IconBtn title="Remove" onClick={() => removeTask(t.id)}><X size={13} /></IconBtn>
            </div>
          ))}
        </div>
        <div className="add-row-open mt-3">
          <input
            className="input"
            placeholder="Add a task"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTask()}
            style={{ flex: 1 }}
          />
          <IconBtn title="Add" onClick={addTask}><Plus size={15} /></IconBtn>
        </div>
      </div>

      <div className="panel">
        <div className="section-title flex items-center gap-2"><Pencil size={15} /> Log today {todayEntry && <Check size={14} color="var(--success)" />}</div>
        <div className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>How you got there matters more than what you got \u2014 tag it honestly, it isn't scored differently.</div>
        <textarea
          className="input mt-3"
          placeholder="What did you actually work on today?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          style={{ width: '100%', resize: 'vertical' }}
        />
        <div className="flex gap-2 mt-3 flex-wrap">
          {Object.entries(HONESTY).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => setHonesty(key)}
              className="honesty-chip"
              style={honesty === key ? { borderColor: meta.dot, color: 'var(--text)', background: meta.dot + '18' } : {}}
            >
              <span className="pill-dot" style={{ background: meta.dot }} />
              {meta.label}
            </button>
          ))}
        </div>
        <button onClick={submitLog} className="btn-primary mt-3">Log today \u00b7 +15 XP</button>
      </div>

      <div className="panel">
        <div className="section-title">Recent entries</div>
        <div className="space-y-2 mt-3">
          {recentDates.length === 0 && <div className="empty-hint">Nothing logged yet. Your first entry starts the streak.</div>}
          {recentDates.map((d) => {
            const e = state.activityLog[d];
            const meta = HONESTY[e.honesty] || HONESTY.independent;
            return (
              <div key={d} className="log-row">
                <div className="flex items-center gap-2">
                  <span className="pill-dot" style={{ background: meta.dot }} />
                  <span className="mono-readout" style={{ fontSize: 11 }}>{fmtDateLabel(d)}</span>
                </div>
                {e.note && <div className="log-note">{e.note}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- main ---------- */
export default function PlacementConsole() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const firstLoad = useRef(true);
  const saveTimer = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get(STORAGE_KEY);
        if (result && result.value) {
          setState(hydrateState(JSON.parse(result.value)));
        } else {
          setState(DEFAULT_STATE);
        }
      } catch (e) {
        setState(DEFAULT_STATE);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (loading || !state) return;
    if (firstLoad.current) { firstLoad.current = false; return; }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        console.error('Storage save failed', e);
      }
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [state, loading]);

  if (loading || !state) {
    return (
      <div className="console-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
        <Styles />
        <div className="mono-readout" style={{ color: 'var(--text-dim)' }}>booting console\u2026</div>
      </div>
    );
  }

  const dsaSolved = state.dsaTopics.reduce((a, t) => a + t.solved, 0);
  const dsaTotal = state.dsaTopics.reduce((a, t) => a + t.total, 0);
  const dsaPct = dsaTotal > 0 ? (dsaSolved / dsaTotal) * 100 : 0;

  const wdDone = [...state.webdevPhase1.days, ...state.webdevPhase2.days].filter((d) => d.done).length;
  const wdTotal = state.webdevPhase1.days.length + state.webdevPhase2.days.length;
  const webdevPct = wdTotal > 0 ? (wdDone / wdTotal) * 100 : 0;

  const overallPct = (dsaPct + webdevPct) / 2;
  const streak = computeStreak(state.activityLog);
  const level = Math.floor(state.xp / 100) + 1;

  const resetAll = async () => {
    setState(DEFAULT_STATE);
    setSettingsOpen(false);
  };

  const TABS = [
    { id: 'home', label: 'Home', icon: HomeIcon },
    { id: 'dsa', label: 'DSA', icon: Code2 },
    { id: 'webdev', label: 'Web Dev', icon: GitBranch },
    { id: 'projects', label: 'Projects', icon: Folder },
    { id: 'planner', label: 'Planner', icon: ListChecks },
    { id: 'notes', label: 'Notes', icon: StickyNote },
  ];

  return (
    <div className="console-root">
      <Styles />
      <div className="console-header">
        <div>
          <div className="brand">RAHUL // PLACEMENT CONSOLE</div>
          <div className="brand-sub">EIE \u00b7 NIT Silchar \u00b7 5th Sem</div>
        </div>
        <div className="flex items-center gap-4">
          <IconBtn title="Settings" onClick={() => setSettingsOpen((v) => !v)}><Settings size={16} /></IconBtn>
        </div>
      </div>

      {settingsOpen && (
        <div className="panel-flat mb-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="stat-label" style={{ marginBottom: 0 }}>Target date</span>
            <input
              type="date"
              className="input"
              value={state.targetDate}
              onChange={(e) => setState((s) => ({ ...s, targetDate: e.target.value }))}
            />
          </div>
          <button onClick={resetAll} className="btn-danger"><RotateCcw size={13} /> Reset all data</button>
        </div>
      )}

      <div className="tab-rail">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={tab === t.id ? 'tab-btn tab-btn-active' : 'tab-btn'}>
              <Icon size={14} /> {t.label} {tab === t.id && <ChevronRight size={12} />}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {tab === 'home' && <HomeTab state={state} setState={setState} overallPct={overallPct} dsaPct={dsaPct} webdevPct={webdevPct} streak={streak} level={level} />}
        {tab === 'dsa' && <DsaTab state={state} setState={setState} />}
        {tab === 'webdev' && <WebDevTab state={state} setState={setState} />}
        {tab === 'projects' && <ProjectsTab state={state} setState={setState} />}
        {tab === 'planner' && <PlannerTab state={state} setState={setState} />}
        {tab === 'notes' && <NotesTab state={state} setState={setState} />}
      </div>
    </div>
  );
}

function Styles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

      .console-root {
        --bg: #0B0E13;
        --panel: rgba(20, 25, 34, 0.72);
        --panel-flat: #141922;
        --border: #262D3A;
        --accent: #E8A33D;
        --accent-2: #4FD1E8;
        --success: #5FD98A;
        --danger: #F1615A;
        --text: #ECEEF3;
        --text-dim: #8A93A6;
        --track: #202632;
        --tick: #333B4A;
        --font-display: 'Space Grotesk', sans-serif;
        --font-body: 'Inter', sans-serif;
        --font-mono: 'JetBrains Mono', monospace;
        background: radial-gradient(ellipse at top, #131822 0%, var(--bg) 60%);
        color: var(--text);
        font-family: var(--font-body);
        padding: 20px;
        border-radius: 16px;
        max-width: 780px;
        margin: 0 auto;
      }
      .console-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
      .brand { font-family: var(--font-display); font-weight: 700; font-size: 15px; letter-spacing: 0.04em; }
      .brand-sub { font-family: var(--font-mono); font-size: 10.5px; color: var(--text-dim); margin-top: 2px; letter-spacing: 0.03em; }
      .tab-rail { display: flex; gap: 8px; border-bottom: 1px solid var(--border); padding-bottom: 10px; flex-wrap: wrap; }
      .tab-btn {
        display: flex; align-items: center; gap: 6px; font-family: var(--font-body); font-size: 12.5px; font-weight: 500;
        color: var(--text-dim); background: transparent; border: 1px solid transparent; padding: 7px 12px; border-radius: 9px; cursor: pointer;
        transition: all 0.15s ease;
      }
      .tab-btn:hover { color: var(--text); background: rgba(255,255,255,0.03); }
      .tab-btn-active { color: var(--accent); background: rgba(232,163,61,0.1); border-color: rgba(232,163,61,0.3); }
      .panel {
        background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 16px;
        backdrop-filter: blur(10px);
      }
      .panel-flat { background: var(--panel-flat); border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; }
      .section-title { font-family: var(--font-display); font-weight: 600; font-size: 13px; letter-spacing: 0.02em; }
      .stat-label { font-family: var(--font-body); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); margin-bottom: 6px; }
      .stat-value { font-family: var(--font-mono); font-size: 22px; font-weight: 600; }
      .stat-unit { font-size: 12px; color: var(--text-dim); font-weight: 400; }
      .mono-readout { font-family: var(--font-mono); font-size: 12px; color: var(--text-dim); min-width: 48px; text-align: right; }
      .task-row { display: flex; align-items: center; gap: 9px; padding: 6px 2px; cursor: pointer; }
      .task-text { font-size: 13px; color: var(--text); }
      .task-text-done { font-size: 13px; color: var(--text-dim); text-decoration: line-through; }
      .day-num { font-family: var(--font-mono); font-size: 10.5px; color: var(--accent-2); min-width: 42px; }
      .checkbox { width: 15px; height: 15px; accent-color: var(--accent); cursor: pointer; flex-shrink: 0; }
      .heat-cell { width: 100%; aspect-ratio: 1; border-radius: 4px; }
      .empty-hint { font-size: 12.5px; color: var(--text-dim); font-style: italic; }
      .topic-row { border-bottom: 1px solid var(--border); padding-bottom: 10px; }
      .topic-row:last-child { border-bottom: none; padding-bottom: 0; }
      .topic-name { font-size: 13px; font-weight: 500; }
      .track-bg { height: 7px; background: var(--track); border-radius: 4px; overflow: hidden; }
      .track-fill { height: 100%; border-radius: 4px; transition: width 0.3s ease; }
      .pill { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-mono); font-size: 10px; font-weight: 600; letter-spacing: 0.04em; padding: 4px 9px; border-radius: 20px; border: 1px solid; background: transparent; cursor: pointer; }
      .pill-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
      .icon-btn { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 7px; border: 1px solid var(--border); background: rgba(255,255,255,0.02); color: var(--text-dim); cursor: pointer; transition: all 0.15s ease; }
      .icon-btn:hover { color: var(--text); border-color: var(--accent); }
      .add-row-trigger { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-dim); background: transparent; border: 1px dashed var(--border); border-radius: 9px; padding: 8px 12px; cursor: pointer; width: 100%; justify-content: center; }
      .add-row-trigger:hover { color: var(--accent); border-color: var(--accent); }
      .add-row-open { display: flex; align-items: center; gap: 8px; }
      .input { background: var(--panel-flat); border: 1px solid var(--border); border-radius: 8px; padding: 7px 10px; color: var(--text); font-family: var(--font-body); font-size: 12.5px; outline: none; }
      .input:focus { border-color: var(--accent); }
      .btn-primary { font-family: var(--font-body); font-weight: 600; font-size: 12.5px; color: #16110A; background: var(--accent); border: none; border-radius: 9px; padding: 9px 16px; cursor: pointer; }
      .btn-danger { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--danger); background: rgba(241,97,90,0.1); border: 1px solid rgba(241,97,90,0.3); border-radius: 8px; padding: 7px 12px; cursor: pointer; }
      .honesty-chip { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-dim); background: var(--panel-flat); border: 1px solid var(--border); border-radius: 20px; padding: 6px 12px; cursor: pointer; }
      .log-row { border-bottom: 1px solid var(--border); padding-bottom: 8px; }
      .log-row:last-child { border-bottom: none; padding-bottom: 0; }
      .log-note { font-size: 12px; color: var(--text-dim); margin-top: 3px; margin-left: 14px; }
      .revision-line { display: flex; align-items: center; justify-content: space-between; margin-top: 7px; }
      .revision-due-text { font-family: var(--font-mono); font-size: 10.5px; color: var(--danger); }
      .revision-ok-text { font-family: var(--font-mono); font-size: 10.5px; color: var(--text-dim); }
      .tag-chip { display: inline-flex; align-items: center; font-family: var(--font-mono); font-size: 10px; color: var(--text-dim); background: rgba(255,255,255,0.04); border: 1px solid var(--border); border-radius: 6px; padding: 2px 7px; }
      .project-form { display: flex; flex-direction: column; }
      .note-card { border-bottom: 1px solid var(--border); padding-bottom: 8px; }
      .note-card:last-child { border-bottom: none; padding-bottom: 0; }
      .note-body { margin-top: 6px; font-size: 12.5px; color: var(--text-dim); line-height: 1.5; }
      .inline-code { font-family: var(--font-mono); background: rgba(255,255,255,0.06); padding: 1px 5px; border-radius: 4px; font-size: 11.5px; color: var(--accent-2); }
      .filter-chip { font-size: 11.5px; color: var(--text-dim); background: var(--panel-flat); border: 1px solid var(--border); border-radius: 20px; padding: 5px 11px; cursor: pointer; }
      .filter-chip-active { color: var(--accent); border-color: var(--accent); background: rgba(232,163,61,0.1); }
      .resource-link { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--accent-2); text-decoration: none; }
      .resource-link:hover { text-decoration: underline; }
      .space-y-1\\.5 > * + * { margin-top: 6px; }
    `}</style>
  );
}
