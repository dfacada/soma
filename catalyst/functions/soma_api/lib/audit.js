// The audit trail: every time an admin acts on someone else's account, or looks at more than Ops shows by default,
// one row lands in ops_audit (who, what, to whom, why). Dayhub Ops → Audit reads it. Rows are never pruned and there is
// no route that changes or deletes them.
//
// The person a row is about reads it too (GET /account/audit, Settings → What Dayhub can see; 2026-11-11, "privacy
// people can see"): when, what, which admin, and the reason when one was written. So a reason is written for them as
// much as for the record, and Ops says so where it asks for one. Of the detail column, only a few known facts go to
// the member (forMember), never the column as it is.

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

// The actions that are about one person, and so are theirs to read. Anything else (a problem muted, the alerts
// changed) has no target and is never selected for a member anyway.
const MEMBER_ACTIONS = ['person_viewed', 'activity_viewed', 'values_shown', 'message_sent', 'issue_handled', 'issue_reopened', 'profile_status', 'profile_role'];
// Ops' issue kinds (lib/ops.js keyOf: the kind, lower case, dashed): the only part of an issue key a member is told.
const ISSUE_KINDS = ['fitbit', 'journal', 'errors', 'reminders', 'ai-limits', 'approval', 'gone-quiet', 'messages'];
const STATES = ['active', 'disabled', 'admin', 'member'];

/**
 * A member's own audit rows, as they may read them: when, what, who did it ("you" when it was themselves, an admin
 * looking at their own page), the reason when one was written, and `about` only where it is one of a few known words
 * (which issue was handled, what a status became). The rest of the detail column stays on the server.
 */
function forMember(rows, me, nameOf) {
  const parse = (t) => { try { const v = JSON.parse(t || 'null'); return v && typeof v === 'object' ? v : {}; } catch (_e) { return {}; } };
  return (Array.isArray(rows) ? rows : []).filter((r) => r && MEMBER_ACTIONS.includes(r.action)).map((r) => {
    const d = parse(r.detail);
    let about = null;
    if (r.action === 'issue_handled' || r.action === 'issue_reopened') {
      const kind = String(d.issue || '').split(':')[0];
      about = ISSUE_KINDS.includes(kind) ? kind : null;
    } else if (r.action === 'profile_status' || r.action === 'profile_role') {
      about = STATES.includes(d.to) ? d.to : null;
    }
    return {
      at: Number(r.created_ms) || 0,
      action: r.action,
      by: String(r.actor_id) === String(me) ? 'you' : nameOf(r.actor_id),
      reason: r.reason ? String(r.reason).slice(0, 255) : null,
      about
    };
  });
}

module.exports = { audit, forMember, MEMBER_ACTIONS, ISSUE_KINDS };
