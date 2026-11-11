// The audit trail: every time an admin acts on someone else's account, or looks at more than Ops shows by default,
// one row lands in ops_audit (who, what, to whom, why). Dayhub Ops → Audit reads it. Rows are never pruned and there is
// no route that changes or deletes them.
//
// The person a look was at reads it too, for the looks that come with a reason (GET /account/audit, Settings → What
// Dayhub can see; 2026-11-11, "privacy people can see"): when an admin opened their food, weight and activity, which
// admin, and why. So that reason is written for them as much as for the record, and Ops says so where it asks for one.
// Everything else (a page opened, an issue handled, a status changed) stays in Ops' own Audit: David, the same day,
// "I'm not sure we need that granular transparency right away". The first version showed every action, with words
// for each (commit 07d4f2a), to bring back if it is ever wanted.

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

// The actions a member reads of their own record: for now, only the look that comes with a reason.
const MEMBER_ACTIONS = ['values_shown'];

/**
 * A member's own audit rows, as they may read them: when, what, who did it ("you" when it was themselves, an admin
 * looking at their own values), and the reason. Never the detail column.
 */
function forMember(rows, me, nameOf) {
  return (Array.isArray(rows) ? rows : []).filter((r) => r && MEMBER_ACTIONS.includes(r.action)).map((r) => ({
    at: Number(r.created_ms) || 0,
    action: r.action,
    by: String(r.actor_id) === String(me) ? 'you' : nameOf(r.actor_id),
    reason: r.reason ? String(r.reason).slice(0, 255) : null
  }));
}

module.exports = { audit, forMember, MEMBER_ACTIONS };
