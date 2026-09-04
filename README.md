# Ledgerline

**A worker paid in stablecoins on another chain proves that income to Creditcoin, and gets a
credit line without posting collateral.**

Built for BUIDL CTC 2026 Fall on Creditcoin's Attestcoin Protocol.

## The problem

Creditcoin exists because a repayment record is an asset, and most of the world's is invisible
on-chain. A gig worker paid in USDC on Base has no capital on Creditcoin and nothing to pledge —
so under every collateralised lending design, they cannot borrow. What they do have is six months
of provable income on a chain that isn't this one.

Getting that history here has always required trusting someone: a bridge, an oracle committee, an
attester-of-record. Ledgerline removes them.

## What it does

1. A `Payer` on Ethereum Sepolia pays a worker and emits
   `PaymentMade(worker, amount, period)`. The payer never touches Creditcoin, signs nothing here,
   and bridges no token.
2. Anyone fetches an inclusion + continuity proof for that transaction and submits it to
   `IncomeRegistry.execute()` on Creditcoin.
3. The `0x0FD2` precompile verifies the proof **synchronously, in the same transaction**. The
   registry authenticates the emitting contract, decodes the payment, and folds it into a running
   record: total received, payment count, first and last period.
4. `CreditLine` reads that record — not a balance, not a collateral ratio — and derives a limit.
   Two proven periods buys a quarter of a period of credit; six or more buys 1.25×.
5. The borrower draws. **Nothing is pledged, at any point.**

Only a fact crosses chains. No token ever does.

## Why this needs Attestcoin specifically

A bridge moves value; it cannot tell you a payment *history*. An oracle committee could attest one,
but then the credit decision rests on the committee. Ledgerline's entire premise is that a lender
can verify a borrower's foreign income without trusting the party that reports it — which is
exactly and only what the `0x0FD2` precompile provides. Remove it and there is no product.

## Income going quiet is the default signal

An unsecured line has no collateral to seize, so the risk model is cadence. `isCurrent()` freezes
the line when the newest proven period ages past the stale window. This is not incidental — during
development the registry correctly refused credit against a real, fully-proven six-payment history
because those payments were six months old. The freeze is the underwriting.

## Security inheritance

`AttestBase` is the hardened base contract from [Deadswitch](https://github.com/Nuel-osas/deadswitch),
written after finding two flaws in the tutorial's `USCBase` and filed upstream as
[gluwa/USC-Builder-Examples#37](https://github.com/gluwa/USC-Builder-Examples/issues/37):

- the action is derived from each log's own `topics[0]`, never trusted from the caller
- every log from the registered source is applied in order; foreign logs are skipped rather than
  reverted on, so a decoy log cannot censor a genuine payment
- `blockHeight` is threaded through so stale proofs cannot overwrite newer state

Two guards are specific to *creating money* rather than destroying it:

- only the registered `Payer` can emit countable income — otherwise anyone deploys a contract that
  emits `PaymentMade` for their own address and mints themselves a credit history
- each `(worker, period)` pair counts exactly once, across all transactions — otherwise one payslip
  is replayed into an unlimited limit

## Scope

MVP, deliberately. One source chain, one payer, a single-lender pool, no interest, no term, no
secondary market, no liquidation. The submission is the primitive: **foreign income, proven
trustlessly, priced into unsecured credit.**
