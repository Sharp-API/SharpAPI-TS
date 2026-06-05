# Review rules — sharpapi-ts (official TypeScript SDK)

Guidance for the automated Claude PR reviewer (`.github/workflows/claude-review.yml`).

## Severity
- **[Critical]** — bug, a backward-incompatible change to the public API, or a type-soundness hole.
- **[Important]** — a real problem to fix before merge.
- **[Nit]** — minor/style. Skip what ESLint already enforces.

## Always check
- **Backward compatibility** — exported types/functions/options are a published contract (npm is immutable). Flag any breaking change.
- **Type soundness** — passes `tsc --noEmit`; no `any` leakage in public types; correct generics.
- **ESM correctness** — import/export shape, `package.json` exports map, no CJS/ESM hazards.
- **API parity** — the SDK matches the documented SharpAPI surface.

## Don't
- Don't flag pre-existing code this PR didn't touch.
- You MAY run `npx tsc --noEmit` / `npm run lint` to confirm a concern; otherwise don't speculate — cite `file:line` or omit. "LGTM" is valid.
