import AuditLog from '../models/AuditLog.js';

/**
 * Central audit writer. NEVER throws — a logging failure must not break core
 * shipment/exception operations. Every important mutation in the system calls
 * this to record who did what, and what changed (before/after).
 */
export async function recordAudit({ actor, action, entity = {}, summary, changes = [], meta }) {
  try {
    // Drop no-op changes (from === to) so the trail stays meaningful.
    const cleanChanges = (changes || []).filter(
      (c) => JSON.stringify(c.from ?? null) !== JSON.stringify(c.to ?? null)
    );
    await AuditLog.create({
      action,
      category: action.split('.')[0],
      actor: {
        id: actor?._id || actor?.id || undefined,
        name: actor?.name || 'System',
        role: actor?.role || 'System',
        email: actor?.email,
      },
      entity,
      summary,
      changes: cleanChanges,
      meta,
      at: new Date(),
    });
  } catch (err) {
    console.error('[audit] write failed:', err.message);
  }
}

// Convenience: diff plain objects field-by-field into before/after changes.
export function diffChanges(before, after, fields) {
  const out = [];
  for (const f of fields) {
    const b = get(before, f);
    const a = get(after, f);
    if (JSON.stringify(b ?? null) !== JSON.stringify(a ?? null)) {
      out.push({ field: f, from: b ?? null, to: a ?? null });
    }
  }
  return out;
}

function get(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
