import { useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { IconSparkles, IconCopy, IconCheck, IconEscalate, IconShield } from './Icons.jsx';

const RISK_COLORS = { Low: '#16a34a', Moderate: '#d97706', High: '#ea580c', Severe: '#dc2626' };

export default function PlanCard({ plan, loading, onGenerate, title = 'Gemini AI Recovery Plan', onApplyTeam }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(plan.customerMessage);
      setCopied(true);
      toast.success('Customer message copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed — select the text manually');
    }
  };

  return (
    <div className="ai-card">
      <div className="ai-head">
        <h3><IconSparkles size={17} color="#4f46e5" /> {title}</h3>
        <div style={{ flex: 1 }} />
        {plan?.source && (
          <span className={`source-badge ${String(plan.source).startsWith('gemini') ? 'gemini' : 'fallback'}`}>
            {plan.source}
          </span>
        )}
        <button className="btn btn-primary btn-sm" onClick={onGenerate} disabled={loading}>
          {loading ? <span className="spinner" style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,.35)', width: 14, height: 14 }} /> : <IconSparkles size={14} />}
          {loading ? 'Generating…' : plan ? 'Regenerate Plan' : 'Generate Plan'}
        </button>
      </div>
      <div className="ai-body">
        {loading && !plan && (
          <div className="flex" style={{ padding: '18px 0', color: '#4f46e5', fontWeight: 600, fontSize: 13.5 }}>
            <span className="spinner" /> Analyzing shipment context and building the recovery plan…
          </div>
        )}
        {!loading && !plan && (
          <p className="text-sm text-muted mt0 mb0">
            Generate an AI-powered risk assessment with recovery actions, team recommendation, priority,
            escalation advice and a ready-to-send customer message. If Gemini is unreachable, a rule-based plan is produced automatically — nothing here can break your operations.
          </p>
        )}
        {plan && (
          <>
            <div className="info-banner" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 2 }}>
              <IconShield size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>
                <b>Advisory suggestion — nothing is applied automatically.</b>{' '}
                {plan.validation?.valuesAreApproved
                  ? 'All values validated against approved teams, levels and priority classes before display.'
                  : 'Some AI values were adjusted to approved values before display.'}
              </div>
            </div>
            {plan.validation?.adjustments?.length > 0 && (
              <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 11px' }}>
                <b>Auto-corrected by validation:</b>
                {plan.validation.adjustments.map((a, i) => <div key={i}>• {a}</div>)}
              </div>
            )}
            <div className="ai-section">
              <p style={{ fontWeight: 700, fontSize: 14 }}>{plan.summary}</p>
            </div>
            <div className="ai-kv">
              <span className="badge" style={{ color: RISK_COLORS[plan.riskLevel] || '#475569', background: '#fff', border: `1.5px solid ${RISK_COLORS[plan.riskLevel] || '#cbd5e1'}` }}>
                <IconShield size={12} /> Risk: {plan.riskLevel}
              </span>
              <span className="badge" style={{ color: '#3730a3', background: '#e0e7ff' }}>{plan.priorityLevel}</span>
              <span className="badge" style={{ color: '#0f172a', background: '#f1f5f9', border: '1px solid #e2e8f0' }}>Team: {plan.recommendedTeam}</span>
              {onApplyTeam && plan.recommendedTeam && (
                <button className="btn btn-sm btn-ghost" onClick={() => onApplyTeam(plan.recommendedTeam)}>Apply team</button>
              )}
            </div>
            <div className="ai-section">
              <h4>Risk assessment</h4>
              <p>{plan.riskAssessment}</p>
            </div>
            <div className="ai-section">
              <h4>Recovery actions</h4>
              <div className="plan-actions">
                {plan.actions.map((a) => (
                  <div className="plan-action" key={a.step}>
                    <span className="p-num">{a.step}</span>
                    <div>
                      <div className="p-action">{a.action}</div>
                      <div className="p-meta">Owner: {a.owner} · ETA ~{a.etaHours}h</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {plan.escalationSuggestion && (
              <div className="ai-section">
                <h4>Escalation suggestion <span className="tag" style={{ fontSize: 10, textTransform: 'none' }}>suggestion only</span></h4>
                <p>
                  <IconEscalate size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} color="#c2410c" />
                  {plan.escalationSuggestion.needed
                    ? <>Suggested: escalate to <b>{plan.escalationSuggestion.level}</b>. {plan.escalationSuggestion.reason} <i>An authorized user must confirm the escalation.</i></>
                    : <>No immediate escalation required. {plan.escalationSuggestion.reason}</>}
                </p>
              </div>
            )}
            <div className="ai-section">
              <h4>Customer communication draft</h4>
              <div className="customer-draft">
                {plan.customerMessage}
                <div style={{ marginTop: 9 }}>
                  <button className="btn btn-sm" onClick={copyDraft}>{copied ? <IconCheck size={13} color="#16a34a" /> : <IconCopy size={13} />} {copied ? 'Copied' : 'Copy draft'}</button>
                </div>
              </div>
            </div>
            {plan.preventiveMeasures?.length > 0 && (
              <div className="ai-section">
                <h4>Preventive measures</h4>
                <p>{plan.preventiveMeasures.join(' · ')}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
