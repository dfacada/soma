// Which addresses the server will send a push notification to. The server POSTs to whatever a device registered, so
// only real push services are accepted. This file is copied byte for byte into soma_jobs/push-endpoint.js
// (scripts/test-security.mjs checks the copies match): the API checks an address when a device subscribes, and the
// job checks it again before every send. Change one, change the other.
//
// The check has to read an address the way the sender does. web-push picks the host with Node's legacy url.parse,
// which ends a host name at characters the modern URL parser allows inside one (";", "{", "}" and more) and cuts a
// label longer than 63 characters, so "https://evil.example;.push.apple.com/" was a push.apple.com host to the
// check and evil.example to the sender (found 2026-11-10). So: https only, no sign-in part, no port, a host of
// ordinary labels that both parsers agree on, and the address is kept in the modern parser's own spelling.

'use strict';

const legacyUrl = require('url');

const PUSH_HOSTS = [/(^|\.)push\.apple\.com$/, /^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** What web-push's parser makes of an address. Node warns once per process that url.parse is not the standard
 *  parser, which is exactly why it is asked here; the warning is kept out of the function's log. */
function legacyParse(href) {
  const quiet = process.noDeprecation;
  process.noDeprecation = true;
  try { return legacyUrl.parse(href); } catch (_e) { return null; } finally { process.noDeprecation = quiet; }
}

/** The address as the server will use it, or null when it is not a real push service's. */
function pushEndpoint(v) {
  if (typeof v !== 'string' || v.length > 2000) return null;
  let u;
  try { u = new URL(v); } catch (_e) { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  const host = u.hostname;
  if (host.length > 253 || !host.split('.').every((label) => LABEL.test(label)) || !PUSH_HOSTS.some((h) => h.test(host))) return null;
  const old = legacyParse(u.href);
  if (!old || old.protocol !== 'https:' || old.hostname !== host || old.port || old.auth) return null;
  return u.href;
}

module.exports = { pushEndpoint, PUSH_HOSTS };
