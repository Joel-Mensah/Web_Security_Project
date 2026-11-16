import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, ArrowUpRight, CheckCircle2, Clock3, Eye, FileWarning,
  Image, Loader2, MessageSquare, Pencil, Plus, RefreshCw, Search, ShieldAlert, Siren,
  Upload, UserRound, Users, X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import client from '../api/client';

const CATEGORIES = [
  ['suspicious_email', 'Suspicious email or message'],
  ['account_compromise', 'Possible account compromise'],
  ['lost_device', 'Lost or stolen device'],
  ['data_exposure', 'Data exposure or misdirected information'],
  ['malware', 'Malware or suspicious software'],
  ['policy_violation', 'Security policy concern'],
  ['other', 'Other security concern'],
];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = [
  ['new', 'New'],
  ['triaged', 'Triaged'],
  ['in_progress', 'In progress'],
  ['resolved', 'Resolved'],
  ['closed', 'Closed'],
];

const STATUS_STYLE = {
  new: 'border-sky-400/20 bg-sky-400/10 text-sky-200',
  triaged: 'border-violet-400/20 bg-violet-400/10 text-violet-200',
  in_progress: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
  resolved: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  closed: 'border-slate-400/20 bg-slate-400/10 text-slate-300',
};
const SEVERITY_STYLE = {
  low: 'text-slate-300',
  medium: 'text-sky-200',
  high: 'text-amber-300',
  critical: 'text-rose-300',
};
const TRIAGE_ROLES = ['manager', 'admin', 'administrator'];

function formatLabel(value = '') {
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}

function RequestError({ children }) {
  if (!children) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, tone }) {
  const tones = {
    blue: 'bg-sky-400/10 text-sky-200',
    amber: 'bg-amber-400/10 text-amber-200',
    rose: 'bg-rose-400/10 text-rose-200',
    green: 'bg-emerald-400/10 text-emerald-200',
  };
  return (
    <article className="glass-card flex items-center gap-3 p-4">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
        <p className="text-xs text-slate-400">{label}</p>
      </div>
    </article>
  );
}

function formatFileSize(bytes) {
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ReportForm({ onCancel, onCreated }) {
  const [form, setForm] = useState({
    title: '',
    category: 'suspicious_email',
    severity: 'medium',
    description: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [evidence, setEvidence] = useState([]);
  const previewUrls = useRef(new Set());

  useEffect(() => () => {
    previewUrls.current.forEach(url => URL.revokeObjectURL(url));
  }, []);

  const updateField = event => {
    setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  };

  const addEvidence = event => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (evidence.length + selected.length > 3) {
      setError('Attach up to 3 screenshots.');
      return;
    }
    const invalid = selected.find(file =>
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    );
    if (invalid) {
      setError(`${invalid.name}: choose a PNG, JPEG, or WebP image up to 5 MB.`);
      return;
    }
    setError('');
    setEvidence(current => [
      ...current,
      ...selected.map(file => {
        const url = URL.createObjectURL(file);
        previewUrls.current.add(url);
        return { file, url };
      }),
    ]);
  };

  const removeEvidence = url => {
    URL.revokeObjectURL(url);
    previewUrls.current.delete(url);
    setEvidence(current => current.filter(item => item.url !== url));
  };

  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => payload.append(key, value));
      evidence.forEach(({ file }) => payload.append('evidence', file));
      const { data } = await client.post('/incidents', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60_000,
      });
      onCreated(data);
    } catch (err) {
      const messages = err?.response?.data?.errors?.map(item => item.msg);
      setError(err?.response?.data?.message || messages?.join(' ') || 'The report could not be submitted.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="glass-card space-y-5 p-5 sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">New report</p>
        <h2 className="mt-1 text-xl font-semibold text-white">Tell us what happened</h2>
        <p className="mt-2 text-sm text-slate-400">
          Include what you noticed, when it happened, and any action already taken. Never include passwords or MFA codes.
        </p>
      </div>
      <RequestError>{error}</RequestError>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm text-slate-300 sm:col-span-2">
          <span>Report title</span>
          <input
            name="title"
            value={form.title}
            onChange={updateField}
            className="form-input"
            placeholder="e.g. Unexpected sign-in approval request"
            minLength={5}
            maxLength={160}
            required
          />
        </label>
        <label className="space-y-2 text-sm text-slate-300">
          <span>What best describes this?</span>
          <select name="category" value={form.category} onChange={updateField} className="form-input">
            {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-2 text-sm text-slate-300">
          <span>How urgent does it seem?</span>
          <select name="severity" value={form.severity} onChange={updateField} className="form-input">
            {SEVERITIES.map(value => <option key={value} value={value}>{formatLabel(value)}</option>)}
          </select>
        </label>
        <label className="space-y-2 text-sm text-slate-300 sm:col-span-2">
          <span>Description</span>
          <textarea
            name="description"
            value={form.description}
            onChange={updateField}
            className="form-input min-h-36 resize-y"
            placeholder="Describe what happened and when. Do not paste credentials, authentication codes, or sensitive personal data."
            minLength={20}
            maxLength={10000}
            required
          />
          <span className="block text-xs text-slate-500">At least 20 characters. Do not attach or embed confidential credentials.</span>
        </label>
        <div className="space-y-3 sm:col-span-2">
          <div>
            <p className="text-sm font-medium text-ink">Screenshot evidence <span className="font-normal text-slate-500">(optional)</span></p>
            <p className="mt-1 text-xs text-slate-500">PNG, JPEG, or WebP. Up to 3 images, 5 MB each. Remove passwords and personal information before uploading.</p>
          </div>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-5 text-center transition-colors hover:border-emerald-400/40 hover:bg-emerald-400/[0.03]">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"><Upload className="h-5 w-5" /></span>
            <span className="text-sm font-medium text-ink">Choose screenshots</span>
            <span className="text-xs text-slate-500">{evidence.length} of 3 attached</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={addEvidence}
              disabled={evidence.length === 3 || saving}
              className="sr-only"
              aria-label="Choose screenshot evidence"
            />
          </label>
          {evidence.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {evidence.map(({ file, url }) => (
                <li key={url} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/5 bg-black/10 p-2">
                  <img src={url} alt="" className="h-14 w-16 shrink-0 rounded-lg border border-white/10 object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-ink">{file.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatFileSize(file.size)}</p>
                  </div>
                  <button type="button" onClick={() => removeEvidence(url)} disabled={saving} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label={`Remove ${file.name}`}>
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onCancel} className="btn-ghost border border-white/10">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileWarning className="h-4 w-4" />}
          {saving ? 'Submitting…' : 'Submit report'}
        </button>
      </div>
    </form>
  );
}

function EvidenceAttachment({ incidentId, evidence }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadEvidence = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get(`/incidents/${incidentId}/evidence/${evidence.id}`);
      setUrl(data.url);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load this screenshot.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-white/5 bg-black/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-xs text-slate-300">
          <Image className="h-4 w-4 shrink-0 text-emerald-300" />
          <span className="truncate">{evidence.fileName}</span>
          <span className="shrink-0 text-slate-500">{formatFileSize(evidence.size)}</span>
        </div>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-200 hover:text-emerald-100">
            <Eye className="h-3.5 w-3.5" /> Open screenshot
          </a>
        ) : (
          <button type="button" onClick={loadEvidence} disabled={loading} className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-200 hover:text-emerald-100 disabled:opacity-50">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
            {loading ? 'Loading…' : 'View screenshot'}
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
      {url && <img src={url} alt={evidence.fileName} className="mt-3 max-h-96 max-w-full rounded-lg border border-white/10 object-contain" />}
    </div>
  );
}

function IncidentDetail({ incidentId, onBack, canTriage, canRefer, currentUserId, onChanged, refreshKey }) {
  const [data, setData] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [comment, setComment] = useState('');
  const [internal, setInternal] = useState(false);
  const [triage, setTriage] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: detail }, assigneeResponse] = await Promise.all([
        client.get(`/incidents/${incidentId}`),
        canTriage ? client.get('/incidents/assignees') : Promise.resolve({ data: [] }),
      ]);
      setData(detail);
      setAssignees(assigneeResponse.data);
      setTriage({
        status: detail.incident.status,
        severity: detail.incident.severity,
        assigneeId: detail.incident.assignee_id || '',
        resolutionSummary: detail.incident.resolution_summary || '',
      });
      setEditForm({
        title: detail.incident.title,
        description: detail.incident.description,
        category: detail.incident.category,
        severity: detail.incident.severity,
      });
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load this report.');
    } finally {
      setLoading(false);
    }
  }, [incidentId, canTriage]);

  useEffect(() => { loadDetail(); }, [loadDetail, refreshKey]);

  const saveTriage = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const changes = {
        status: triage.status,
        severity: triage.severity,
        assigneeId: triage.assigneeId || null,
      };
      if (triage.resolutionSummary.trim()) {
        changes.resolutionSummary = triage.resolutionSummary.trim();
      }
      await client.patch(`/incidents/${incidentId}/triage`, changes);
      setNotice('Triage changes saved.');
      await loadDetail();
      onChanged();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not save triage changes.');
    } finally {
      setSaving(false);
    }
  };

  const submitComment = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await client.post(`/incidents/${incidentId}/updates`, { message: comment, internal });
      setComment('');
      setInternal(false);
      setNotice(internal ? 'Private note added.' : 'Update posted.');
      await loadDetail();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not post this update.');
    } finally {
      setSaving(false);
    }
  };

  const saveReportEdit = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await client.patch(`/incidents/${incidentId}`, editForm);
      setEditing(false);
      setNotice('Your incident report was updated.');
      await loadDetail();
      onChanged();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not update this report.');
    } finally {
      setSaving(false);
    }
  };

  const referToAuthority = async () => {
    const confirmed = window.confirm(
      'Record this report as referred to Ghana Authority Security? This locks reporter editing. You must contact the authority through your approved channel, as this action does not send the report externally.'
    );
    if (!confirmed) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await client.patch(`/incidents/${incidentId}/triage`, { referToAuthority: true });
      setNotice('Referral recorded. Contact Ghana Authority Security through your approved channel.');
      await loadDetail();
      onChanged();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not record the referral.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="glass-card flex items-center justify-center gap-3 p-12 text-slate-300"><Loader2 className="h-5 w-5 animate-spin" /> Loading report…</div>;
  }
  if (error && !data) {
    return <section className="space-y-4"><button onClick={onBack} className="btn-ghost flex items-center gap-2"><ArrowLeft className="h-4 w-4" /> Back to reports</button><RequestError>{error}</RequestError></section>;
  }
  if (!data) return null;

  const { incident, updates } = data;
  const reporterCanEdit = incident.reporter_id === currentUserId &&
    incident.reporter_can_edit;
  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="btn-ghost flex items-center gap-2 pl-0">
        <ArrowLeft className="h-4 w-4" /> Back to reports
      </button>
      <RequestError>{error}</RequestError>
      {notice && <p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</p>}

      <section className="glass-card overflow-hidden">
        <div className="border-b border-white/5 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Incident report</p>
              <h2 className="mt-2 break-words text-2xl font-bold text-white">{incident.title}</h2>
              <p className="mt-2 text-sm text-slate-400">
                Reported by {incident.reporter_username || 'Former user'} · {formatDate(incident.created_at)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLE[incident.status]}`}>
                {formatLabel(incident.status)}
              </span>
              <span className={`rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold ${SEVERITY_STYLE[incident.severity]}`}>
                {formatLabel(incident.severity)} severity
              </span>
              {incident.referred_to_authority_at && (
                <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">
                  Referred for investigation
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_260px] sm:p-7">
          <div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400">
              <span>Category: <strong className="font-medium text-ink">{formatLabel(incident.category)}</strong></span>
              <span>Assigned to: <strong className="font-medium text-ink">{incident.assignee_username || 'Unassigned'}</strong></span>
              <span>Last updated: <strong className="font-medium text-ink">{formatDate(incident.updated_at)}</strong></span>
            </div>
            {editing ? (
              <form onSubmit={saveReportEdit} className="mt-6 space-y-4 rounded-xl border border-white/5 bg-black/10 p-4">
                <h3 className="text-sm font-semibold text-white">Edit your report</h3>
                <label className="block space-y-2 text-sm text-slate-300">
                  <span>Report title</span>
                  <input
                    value={editForm.title}
                    onChange={event => setEditForm(value => ({ ...value, title: event.target.value }))}
                    className="form-input"
                    minLength={5}
                    maxLength={160}
                    required
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm text-slate-300">
                    <span>Category</span>
                    <select
                      value={editForm.category}
                      onChange={event => setEditForm(value => ({ ...value, category: event.target.value }))}
                      className="form-input"
                    >
                      {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm text-slate-300">
                    <span>Severity</span>
                    <select
                      value={editForm.severity}
                      onChange={event => setEditForm(value => ({ ...value, severity: event.target.value }))}
                      className="form-input"
                    >
                      {SEVERITIES.map(value => <option key={value} value={value}>{formatLabel(value)}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block space-y-2 text-sm text-slate-300">
                  <span>Description</span>
                  <textarea
                    value={editForm.description}
                    onChange={event => setEditForm(value => ({ ...value, description: event.target.value }))}
                    className="form-input min-h-36 resize-y"
                    minLength={20}
                    maxLength={10000}
                    required
                  />
                </label>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setEditing(false)} className="btn-ghost border border-white/10">Cancel</button>
                  <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                    Save changes
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-white">What was reported</h3>
                  {reporterCanEdit && (
                    <button type="button" onClick={() => setEditing(true)} className="btn-ghost flex items-center gap-2 border border-white/10 text-sm">
                      <Pencil className="h-3.5 w-3.5" /> Edit report
                    </button>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-white/5 bg-black/10 p-4 text-sm leading-6 text-slate-300">{incident.description}</p>
                {incident.reporter_id === currentUserId && !reporterCanEdit && (
                  <p className="mt-2 text-xs text-slate-500">
                    {incident.referred_to_authority_at
                      ? 'Editing is locked because this report was referred for investigation.'
                      : 'Editing is locked because a responder has replied.'}
                  </p>
                )}
              </>
            )}
            {incident.resolution_summary && (
              <div className="mt-4 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Resolution summary</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{incident.resolution_summary}</p>
              </div>
            )}
          </div>
          <aside className="rounded-xl border border-white/5 bg-white/[0.025] p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><Clock3 className="h-4 w-4 text-emerald-300" /> Report overview</h3>
            <dl className="mt-4 space-y-4 text-sm">
              <div><dt className="text-xs text-slate-500">Current status</dt><dd className="mt-1 text-ink">{formatLabel(incident.status)}</dd></div>
              <div><dt className="text-xs text-slate-500">Severity</dt><dd className={`mt-1 font-medium ${SEVERITY_STYLE[incident.severity]}`}>{formatLabel(incident.severity)}</dd></div>
              <div><dt className="text-xs text-slate-500">Assigned responder</dt><dd className="mt-1 text-ink">{incident.assignee_username || 'Awaiting assignment'}</dd></div>
              {incident.resolved_at && <div><dt className="text-xs text-slate-500">Resolved</dt><dd className="mt-1 text-ink">{formatDate(incident.resolved_at)}</dd></div>}
              {incident.referred_to_authority_at && <div><dt className="text-xs text-slate-500">Referred for investigation</dt><dd className="mt-1 text-ink">{formatDate(incident.referred_to_authority_at)}</dd></div>}
            </dl>
          </aside>
        </div>
      </section>

      {canTriage && (
        <form onSubmit={saveTriage} className="glass-card space-y-4 p-5 sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Response controls</p>
            <h3 className="mt-1 text-lg font-semibold text-white">Triage and assignment</h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-2 text-sm text-slate-300">
              <span>Status</span>
              <select value={triage.status} onChange={e => setTriage(value => ({ ...value, status: e.target.value }))} className="form-input">
                {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              <span>Severity</span>
              <select value={triage.severity} onChange={e => setTriage(value => ({ ...value, severity: e.target.value }))} className="form-input">
                {SEVERITIES.map(value => <option key={value} value={value}>{formatLabel(value)}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              <span>Assignee</span>
              <select value={triage.assigneeId} onChange={e => setTriage(value => ({ ...value, assigneeId: e.target.value }))} className="form-input">
                <option value="">Unassigned</option>
                {assignees.map(person => <option key={person.id} value={person.id}>{person.username} · {formatLabel(person.role)}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm text-slate-300 sm:col-span-3">
              <span>Resolution summary <span className="text-slate-500">(required to resolve)</span></span>
              <textarea
                value={triage.resolutionSummary}
                onChange={e => setTriage(value => ({ ...value, resolutionSummary: e.target.value }))}
                className="form-input min-h-24 resize-y"
                maxLength={5000}
                placeholder="Summarize the response and outcome when resolving this report."
              />
            </label>
          </div>
          <div className="flex justify-end">
            <div className="flex flex-wrap justify-end gap-3">
              {canRefer && !incident.referred_to_authority_at && (
                <button type="button" onClick={referToAuthority} disabled={saving} className="btn-ghost border border-amber-400/20 text-amber-200">
                  Record referral to Ghana Authority Security
                </button>
              )}
              <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save triage changes
              </button>
            </div>
          </div>
          {canRefer && <p className="text-xs text-slate-500 sm:text-right">
            Recording a referral locks reporter edits. It does not send this report outside the system.
          </p>}
        </form>
      )}

      <section className="glass-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-ink"><MessageSquare className="h-4 w-4 text-emerald-500 dark:text-emerald-300" /> Incident conversation</h3>
            <p className="mt-1 text-xs text-ink-soft">Public replies are visible to the reporter. Private notes stay with incident managers.</p>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-200">{updates.length} messages</span>
        </div>
        {updates.length ? (
          <ol className="mt-5 max-h-[34rem] space-y-4 overflow-y-auto rounded-2xl border border-slate-200/70 bg-slate-50/60 p-4 dark:border-white/5 dark:bg-black/10">
            {updates.map(update => (
              <li
                key={update.id}
                className={`flex ${update.details?.systemMessage ? 'justify-center' : update.actor_id === currentUserId ? 'justify-end' : 'justify-start'}`}
              >
                <article className={`max-w-[92%] rounded-2xl border p-4 sm:max-w-[80%] ${
                  update.details?.systemMessage
                    ? 'border-sky-500/30 bg-sky-500/[0.08]'
                    : update.is_internal
                    ? 'border-amber-500/30 bg-amber-500/[0.10]'
                    : update.actor_id === currentUserId
                      ? 'border-emerald-500/30 bg-emerald-500/[0.10]'
                      : 'border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.04]'
                }`}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-ink">
                      {update.details?.systemMessage
                        ? 'Site assistant'
                        : update.actor_id === currentUserId ? 'You' : update.actor_username || 'Former user'}
                    </span>
                    {update.details?.systemMessage && <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-800 dark:bg-sky-400/10 dark:text-sky-200">Automatic message</span>}
                    {update.is_internal && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">Private note</span>}
                    {update.update_type !== 'comment' && <span className="text-xs text-ink-soft">· {formatLabel(update.update_type)}</span>}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink">{update.message}</p>
                  {update.details?.evidence && (
                    <EvidenceAttachment incidentId={incidentId} evidence={update.details.evidence} />
                  )}
                  <time className="mt-2 block text-right text-[11px] text-ink-soft">{formatDate(update.created_at)}</time>
                </article>
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-8 text-center text-sm text-ink-soft">No messages yet. Your incident conversation will appear here.</p>
        )}
        <form onSubmit={submitComment} className="mt-5 space-y-3 border-t border-slate-200/70 pt-5 dark:border-white/5">
          <label htmlFor="incident-update" className="block text-sm font-medium text-ink">
            {internal ? 'Add a private note' : canTriage ? 'Reply to reporter' : 'Send a message'}
          </label>
          <textarea
            id="incident-update"
            value={comment}
            onChange={e => setComment(e.target.value)}
            className="form-input min-h-24 resize-y"
            minLength={2}
            maxLength={5000}
            placeholder={internal ? 'Write a note for incident managers only.' : 'Write your message to everyone in this incident conversation.'}
            required
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            {canTriage ? (
              <label className="flex items-center gap-2 text-xs text-ink-soft">
                <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} className="accent-amber-500 dark:accent-amber-400" />
                Visible only to incident managers
              </label>
            ) : <span className="text-xs text-ink-soft">Your update is visible to the reporter and response team.</span>}
            <button type="submit" disabled={saving || comment.trim().length < 2} className="btn-primary flex items-center gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
              {internal ? 'Add private note' : canTriage ? 'Send reply' : 'Send message'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function IncidentsPage() {
  const { user, hasRole } = useAuth();
  const { id: incidentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const canTriage = hasRole(...TRIAGE_ROLES);
  const canRefer = hasRole('admin', 'administrator');
  const [summary, setSummary] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [reporting, setReporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [detailRefresh, setDetailRefresh] = useState(0);

  const loadInbox = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const params = { page, limit: 25 };
      if (status) params.status = status;
      if (severity) params.severity = severity;
      if (category) params.category = category;
      if (search) params.search = search;
      const [list, stats] = await Promise.all([
        client.get('/incidents', { params }),
        client.get('/incidents/summary'),
      ]);
      setIncidents(list.data.incidents);
      setTotal(list.data.total);
      setSummary(stats.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load incident reports.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, search, status, severity, category]);

  useEffect(() => { loadInbox(); }, [loadInbox]);

  const handleCreated = incident => {
    setReporting(false);
    setPage(1);
    setSearch('');
    setStatus('');
    setSeverity('');
    setCategory('');
    setSearchInput('');
    navigate(`/incidents/${incident.id}`, {
      state: {
        submissionNotice: 'Your incident report was submitted successfully. You can view and edit it until a responder replies or an administrator records a referral for investigation.',
      },
    });
    loadInbox(true);
  };

  const applySearch = event => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const title = canTriage ? 'Incident response' : 'Report a security concern';
  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-4 animate-fade-in sm:space-y-7 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Security operations</p>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-white sm:text-3xl">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10"><ShieldAlert className="h-5 w-5 text-emerald-300" /></span>
            {incidentId ? 'Incident details' : title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            {canTriage
              ? 'Review incoming concerns, coordinate the response, and keep a clear record of decisions.'
              : 'Send a concern to your response team and follow the updates. If there is immediate danger, contact your organization’s emergency contact directly.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!incidentId && (
            <button type="button" onClick={() => setReporting(value => !value)} className="btn-primary flex items-center gap-2">
              {reporting ? <ArrowLeft className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {reporting ? 'Back to inbox' : 'Report an incident'}
            </button>
          )}
          <button
            type="button"
            onClick={() => incidentId ? setDetailRefresh(value => value + 1) : loadInbox(true)}
            disabled={refreshing}
            className="btn-ghost flex items-center gap-2 border border-white/10"
            aria-label="Refresh incident information"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </header>

      {location.state?.submissionNotice && (
        <p role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {location.state.submissionNotice}
        </p>
      )}

      {incidentId ? (
        <IncidentDetail
          incidentId={incidentId}
          canTriage={canTriage}
          canRefer={canRefer}
          currentUserId={user?.id}
          onBack={() => navigate('/incidents')}
          onChanged={() => loadInbox(true)}
          refreshKey={detailRefresh}
        />
      ) : reporting ? (
        <ReportForm onCancel={() => setReporting(false)} onCreated={handleCreated} />
      ) : (
        <>
          {error && <RequestError>{error}</RequestError>}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon={Users} label={canTriage ? 'All reports' : 'Your reports'} value={summary?.total} tone="blue" />
            <SummaryCard icon={Clock3} label="Open reports" value={summary?.open} tone="amber" />
            <SummaryCard icon={Siren} label="High or critical priority" value={summary?.urgent} tone="rose" />
            <SummaryCard icon={CheckCircle2} label="Resolved" value={summary?.resolved} tone="green" />
          </section>

          <section className="glass-card overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-white/5 p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="font-semibold text-white">{canTriage ? 'Report queue' : 'Your report history'}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {canTriage ? 'Reports are ordered by severity and recent activity.' : `Signed in as ${user?.username || 'you'}. You can see your reports and reports assigned to you.`}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <form onSubmit={applySearch} className="flex min-w-0 gap-2">
                  <label className="relative min-w-0 flex-1 sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input value={searchInput} onChange={e => setSearchInput(e.target.value)} className="form-input pl-9" placeholder="Search reports" aria-label="Search reports" />
                  </label>
                  <button type="submit" className="btn-ghost border border-white/10">Search</button>
                </form>
                <select
                  value={status}
                  onChange={e => { setPage(1); setStatus(e.target.value); }}
                  className="form-input sm:w-40"
                  aria-label="Filter by status"
                >
                  <option value="">All statuses</option>
                  {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select
                  value={severity}
                  onChange={e => { setPage(1); setSeverity(e.target.value); }}
                  className="form-input sm:w-36"
                  aria-label="Filter by severity"
                >
                  <option value="">All severities</option>
                  {SEVERITIES.map(value => <option key={value} value={value}>{formatLabel(value)}</option>)}
                </select>
                <select
                  value={category}
                  onChange={e => { setPage(1); setCategory(e.target.value); }}
                  className="form-input sm:w-48"
                  aria-label="Filter by category"
                >
                  <option value="">All categories</option>
                  {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center gap-3 p-12 text-sm text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /> Loading reports…</div>
            ) : incidents.length ? (
              <ul className="divide-y divide-white/5">
                {incidents.map(incident => (
                  <li key={incident.id}>
                    <Link to={`/incidents/${incident.id}`} className="group flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-white/[0.025] sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="break-words font-medium text-white group-hover:text-emerald-200">{incident.title}</h3>
                          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[incident.status]}`}>{formatLabel(incident.status)}</span>
                        </div>
                        <p className="mt-1.5 text-xs text-slate-400">
                          {formatLabel(incident.category)} · Reported by {incident.reporter_username || 'Former user'} · {formatDate(incident.created_at)}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                          <UserRound className="h-3 w-3" /> {incident.assignee_username || 'Unassigned'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
                        <span className={`text-xs font-semibold uppercase tracking-wide ${SEVERITY_STYLE[incident.severity]}`}>{formatLabel(incident.severity)}</span>
                        <ArrowUpRight className="h-4 w-4 text-slate-500 transition-colors group-hover:text-emerald-300" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-6 py-14 text-center">
                <FileWarning className="mx-auto h-8 w-8 text-slate-500" />
                <p className="mt-3 font-medium text-white">{search || status || severity || category ? 'No matching reports' : 'No incident reports yet'}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {search || status || severity || category ? 'Try changing your search or report filters.' : 'New reports will appear here after someone submits a concern.'}
                </p>
              </div>
            )}
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 px-4 py-3 sm:px-5">
              <p className="text-xs text-slate-500">
                {total ? `Showing ${(page - 1) * 25 + 1}–${Math.min(page * 25, total)} of ${total}` : 'No reports to show'}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page === 1 || loading} className="btn-ghost border border-white/10 disabled:opacity-40">Previous</button>
                <button type="button" onClick={() => setPage(value => value + 1)} disabled={page * 25 >= total || loading} className="btn-ghost border border-white/10 disabled:opacity-40">Next</button>
              </div>
            </footer>
          </section>
          <p className="text-xs leading-5 text-slate-500">
            This portal coordinates reporting and response; it does not automatically detect or contain threats. Do not use report comments to share passwords, verification codes, or unnecessary personal data.
          </p>
        </>
      )}
    </div>
  );
}
