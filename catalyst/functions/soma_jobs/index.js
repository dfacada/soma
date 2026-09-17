// Soma jobs — Catalyst Job function. Spike version: sleeps past the 30 s Advanced I/O limit,
// then records the run to Stratus so the API can prove the job budget end to end.
// Production version will run transcribe (Groq) and analyze (Claude) jobs; see docs/HANDOFF.md §5.

'use strict';

const catalyst = require('zcatalyst-sdk-node');

module.exports = async (jobRequest, context) => {
  const started = Date.now();
  const app = catalyst.initialize(context, { scope: 'admin' });
  try {
    const params = jobRequest.getAllJobParams() || {};
    const sleepMs = Math.max(0, parseInt(params.sleep_ms || '90000', 10));
    const key = params.result_key || ('spike/job-' + started + '.json');
    console.log(JSON.stringify({ action: 'spike_job_start', sleepMs, key, maxMs: context.getMaxExecutionTimeMs() }));
    await new Promise((r) => setTimeout(r, sleepMs));
    const body = JSON.stringify({
      ok: true,
      sleptMs: Date.now() - started,
      maxExecutionMs: context.getMaxExecutionTimeMs(),
      remainingMs: context.getRemainingExecutionTimeMs(),
      node: process.version,
      finishedAt: new Date().toISOString()
    });
    await app.stratus().bucket('soma-drafts').putObject(key, body, { contentType: 'application/json', overwrite: true });
    if (params.row_id) {
      await app.datastore().table('jobs').updateRow({ ROWID: params.row_id, status: 'done', result_ref: key });
    }
    console.log(JSON.stringify({ action: 'spike_job_done', ms: Date.now() - started }));
    context.closeWithSuccess();
  } catch (e) {
    console.error(JSON.stringify({ action: 'spike_job_failed', error: e.message, ms: Date.now() - started }));
    context.closeWithFailure();
  }
};
