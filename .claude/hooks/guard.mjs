// PreToolUse guard for Bash and PowerShell calls (wired in .claude/settings.json).
//   - refuses a bare `catalyst deploy` of functions: it wipes the secrets from the
//     live function. `node catalyst/deploy.js` merges them in first.
//   - before `git commit`: runs `npm run check`, blocks the commit if it fails,
//     and reminds about src/lib/changelog.ts when app code changed without it.
// Exit 2 blocks the tool call and feeds stderr back to Claude.
import { execSync } from 'node:child_process';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const command = String(JSON.parse(input || '{}').tool_input?.command ?? '');
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function block(message) {
  process.stderr.write(message + '\n');
  process.exit(2);
}

// Each segment of a compound command on its own, so `cd catalyst && catalyst deploy` is caught.
const segments = command.split(/&&|\|\||;|\|/).map((s) => s.trim());

for (const seg of segments) {
  if (/^(npx\s+)?catalyst(\.cmd)?\s+deploy\b/.test(seg) && !/\bdeploy\s+slate\b/.test(seg)) {
    block(
      'Blocked: a bare `catalyst deploy` replaces the function env and wipes the secrets from the live function.\n' +
        'Deploy functions with `node catalyst/deploy.js [soma_api|soma_jobs]`. The frontend is `catalyst deploy slate soma -ni` from catalyst/.',
    );
  }
}

const isCommit = segments.some((seg) => /^git(\s+-C\s+\S+)?\s+commit\b/.test(seg));
if (!isCommit) process.exit(0);

try {
  execSync('npm run check', { cwd: root, stdio: 'pipe', encoding: 'utf8' });
} catch (err) {
  const out = `${err.stdout ?? ''}${err.stderr ?? ''}`.trim().split('\n').slice(-40).join('\n');
  block(`Blocked: \`npm run check\` failed, fix it before committing.\n\n${out}`);
}

// Changed files: tracked edits since HEAD plus untracked files.
const git = (args) => execSync(`git ${args}`, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
const changed = [...git('diff --name-only HEAD'), ...git('ls-files --others --exclude-standard')];
const appCode = changed.filter((f) => /^src\/(app|components)\//.test(f));
if (appCode.length && !changed.includes('src/lib/changelog.ts')) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext:
          `npm run check passed. App code changed (${appCode.slice(0, 5).join(', ')}) but src/lib/changelog.ts did not. ` +
          'If a user could notice this change, add a changelog line in this same commit (CLAUDE.md rule); otherwise carry on.',
      },
    }),
  );
}
