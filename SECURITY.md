# Security Policy

## Reporting

Report vulnerabilities via **[GitHub Security Advisories](https://github.com/afelin/coreward/security/advisories/new)** (preferred) or a private report to the repository owner. Do not open a public issue for undisclosed security flaws.

## Scope

In scope:

- Bypass or weakening of house mandates, TaskBond bounds, or promotion-gate checks when those controls are enabled
- Cryptographic issues in Mandate / Ward verification (Ed25519 principals, capsule hashing)
- Path-traversal or ticket forgery against `authorize_write` / Coreward Mode engine paths

Out of scope / non-bugs:

- IDE Edit/Shell writes outside the engine path (documented; Ward does not claim universal IDE interception)
- “Receipts authorize promote” misconceptions — **receipts are evidence, never authorization**; promote always re-verifies
- Hosted HPURL verify or CyberReady product claims (unclaimed / Planned)
- Social engineering of GitHub org settings or leaked operator secrets

## Honesty

There is **no** paid bug bounty or certification program in this repository. Capsules and `ward_decision` events are **tamper-evident**, not tamper-proof and not legal certification.

Operational checklist: [docs/ward-security.md](docs/ward-security.md). Trust hub: [site/trust](https://afelin.github.io/coreward/trust/).
