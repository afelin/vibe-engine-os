# RISE export — public allowlist and dual-repo strategy

This note defines what may leave the engineering monorepo onto a **public** RISE-facing GitHub / Pages surface. It is an OSS hygiene document, not a go-to-market plan.

## Default dual-repo strategy (A)

| Repo | Role |
|------|------|
| **Engineering** (`afelin/vibe-engine-os` or successor) | Full source, CI, internal docs, experiments |
| **RISE public** (RISE GitHub org mirror or docs repo) | **Docs + site only** by default: white paper HTML/MD, adopt/status/legal pages, `proof/` static receipts, citation metadata |

Strategy **A (default):** keep application/runtime source of truth in the engineering repo; export **documentation and static public site** to RISE GitHub for institutional face and stable Pages URLs. Sync is one-way (engineering → RISE public) on tagged or approved publish SHAs.

Strategy B (optional later): full OSS mirror of the engine under RISE GitHub. Not required for Phase A.

---

## Allowlist (may publish to Pages / RISE public)

| Path / artifact | Notes |
|-----------------|-------|
| `papers/vibe-engine-whitepaper.md` (+ rendered HTML) | Claim-safe technical paper |
| `papers/rise-project-blurb.md` | RI.SE paste + three deep links |
| `CITATION.cff` | Institute citation hygiene |
| `site/` public pages (home, whitepaper, adopt, status, legal) | Built by site agent; calm research/engineering tone |
| `proof/` static proof UI / sample receipts | Evidence surface; no hosted-verify product claims |
| `VOWS.md`, `docs/start-here.md`, `docs/solo-vibe-coder-guide.md`, `docs/nocode-quickstart.md`, `docs/agent-protocol.md`, `docs/agent-adapter.md`, `docs/agent-contract.md`, `docs/launch-proof.md`, `docs/prelaunch-battery.md` | Operator/run books (strip or rewrite any absolute-% / certification phrasing before export if present) |
| `README.md` capability tables | Prefer claim-ledger–safe language; fix “tamper-proof” → “tamper-evident” on export if still present |
| License / NOTICE / this file (`docs/rise-export.md`) | Export policy itself |

Public tone: **portable free OSS primitives**, research/engineering. CyberReady = **one Planned** status cell only.

---

## Denylist (must NOT ship on public Pages / RI.SE)

| Path / topic | Why |
|--------------|-----|
| `docs/go-to-market.md` | Monetization tiers, pricing, CAC/outreach playbooks |
| Spin-off / equity / Swedish cybersecurity governance handoff narrative | Speculative politics; undermines research-project framing |
| Payment tiers as product promise | Contradicts free-primitive public wave |
| “Platform play” / Cloudflare commercial brand push | Wrong phase; parked |
| Certification / “NIS2 compliant” / CRA-as-law claims | Liability + rot; posture packs ≠ law |
| Absolute efficacy percentages as marketing | Not claim-safe |
| Hosted HPURL verify / live CyberReady buyer proof as shipped | Remain **unclaimed** until products exist |
| Secrets, `.env`, private tokens, customer data | Never |
| Internal growth-arc memos that mix commercialization with the paper | Keep offline |

If a sentence helps a future deal but does not help an SME **run or verify** the primitive today, **cut it** from the export.

---

## Public vs internal docs (split)

| Public | Internal (engineering repo or private) |
|--------|----------------------------------------|
| What the software **is**, how to run it free, limits, evidence | Credibility → SME traction → optional later service wrapping |
| White paper, adopt path, proof, citation | GTM tiers, pricing triggers, scar-post outreach calendars |
| Posture packs as house rules | Legal strategy, governance uptake speculation |
| CyberReady Planned | CyberReady commercial packaging |

`docs/go-to-market.md` stays in the engineering tree for operators who need it; **exclude from Pages sync**.

---

## Link rewrite and base-path notes

When mirroring to RISE Pages or a `docs/` site repo:

1. **Base path.** If Pages is served under `https://<host>/<repo>/`, rewrite root-relative links (`/proof/`, `/whitepaper/`) to include the base path, or build with a configured `baseurl`.
2. **Deep links for RI.SE.** The blurb’s three URLs (white paper, repo, proof) should point at the **stable public** hosts after rewrite—not at private Actions artifact URLs.
3. **Cross-repo.** Prefer absolute HTTPS links from RI.SE → RISE Pages and from Pages → `repository-code` on engineering or RISE mirror as published.
4. **SHA pin.** At publish, fill white paper + `CITATION.cff` version/date/**source SHA** so institute citations resolve to an immutable tree.
5. **Placeholder hygiene.** Blurb deep links default to `https://afelin.github.io/vibe-engine-os/...` (GitHub Pages). After RISE mirror publish, rewrite those hosts to the stable RISE Pages URLs before RI.SE paste.

---

## Export checklist (operator)

1. Confirm head SHA is intended publish SHA; fill placeholders.  
2. Run claim-safe skim: no spin-off, equity, payment tiers, certification, absolute %, posture-pack-as-law.  
3. Sync **allowlist only** to RISE public repo / Pages branch.  
4. Verify three RI.SE deep links resolve.  
5. Leave denylist paths untracked on the public remote.

---

## Related

- White paper: [`papers/vibe-engine-whitepaper.md`](../papers/vibe-engine-whitepaper.md)  
- Blurb: [`papers/rise-project-blurb.md`](../papers/rise-project-blurb.md)  
- Citation: [`CITATION.cff`](../CITATION.cff)  
- Claim ledger (engineering): `src/launch/claim-ledger.ts`
