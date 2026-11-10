// The audit trail: every time an admin acts on someone else's account, or looks at more than Ops shows by default,
// one row lands in ops_audit (who, what, to whom, why). Dayhub Ops → Audit reads it. Rows are never pruned and there is
// no route that changes or deletes them.

'use strict';

const { writeLog } = require('./log');

/**
 * Write one row. `must`: throw when it cannot be written, for looks that may only happen on the record (showing
 * someone's values). Otherwise a failure is logged and the action goes ahead.
 */
async function audit(req, action, targetId, reason, detail, must = false) {
  try {
    await req.admin.datastore().table('ops_audit').insertRow({
      created_ms: Date.now(),
      actor_id: req.user.id,
      action: String(action).slice(0, 40),
      target_id: /^\d{1,19}$/.test(String(targetId || '')) ? String(targetId) : null,
      reason: reason ? String(reason).slice(0, 255) : null,
      detail: detail ? JSON.stringify(detail).slice(0, 2000) : null
    });
    return true;
  } catch (e) {
    void writeLog(req.admin, { level: 'error', source: 'api', area: 'audit', event: 'write_failed', message: e.message, detail: { action }, userId: req.user.id });
    if (must) throw e;
    return false;
  }
}

module.exports = { audit };
