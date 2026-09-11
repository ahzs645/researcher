# Security Policy

## Reporting a Vulnerability

Reporting any potential vulnerability is strongly encouraged.

**Please report privately through GitHub, not in a public issue:** go to this
repository's **Security** tab → **Report a vulnerability** (GitHub private
vulnerability reporting). That keeps the report confidential between you and
the maintainers while it is being assessed.

Include as much as you can:

- a description of the issue and its impact,
- steps to reproduce, and
- the affected version, commit or deployment.

While the issue is being addressed, please keep it confidential, and please do
not exploit it or disclose it to others.

There is no bug bounty program for this project. Contributions are still
appreciated, and reporters who want credit will be acknowledged in the fix.

## Scope

`researcher` runs entirely in the browser: data lives in the visitor's own
IndexedDB and there is no server, account or shared database in the default
deployment. Reports about the static site, the client-side data bridge, the
manuscript importers and the exporters are in scope.

This repository is a fork of [Twenty](https://github.com/twentyhq/twenty) and
vendors upstream packages (including `twenty-server`) that this project does not
run. **Vulnerabilities in unmodified upstream code should be reported to the
upstream project**, following its own security policy — not here.

## Security Features

Suggestions that would improve the product's security are welcome via this
repository's issues or discussions.

⚠️ Note this does not apply to security vulnerabilities. If you're in doubt,
always follow the private reporting process above.
