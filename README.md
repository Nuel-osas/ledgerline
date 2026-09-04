# Ledgerline

**A DePIN operator proves the revenue their hardware earns across several networks, on another
chain, and finances more hardware against the aggregate. No collateral is posted, at any point.**

Built for BUIDL CTC 2026 Fall on Creditcoin's Attestcoin Protocol.

## The problem

A wireless hotspot, a solar meter, a storage node: each settles its revenue on whichever chain its
network runs on. To grow, the operator needs capital for the next unit of hardware. Under every
collateralised design they cannot get it, because they hold nothing on the lending chain.

What they do have is an earnings record. Moving that record across has always required trusting
someone: a bridge, an oracle committee, an attester-of-record. Ledgerline removes them.

And there is a harder version of the problem. An operator runs a hotspot on one network, a storage
node on another, a sensor on a third. **Each network sees only its own slice**, so none of them can
underwrite the operator — to every individual network they look unbankable, while in aggregate they
are obviously good for it.

No single network can fix this, because no single network can see the others. Creditcoin can,
because every stream is proven into the same registry.

## What it does

1. The network settles the operator's revenue on Ethereum Sepolia, emitting
   `PaymentMade(operator, amount, period)`. It never touches Creditcoin, signs nothing here, and
   bridges no token.
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

## A node that stops earning has stopped working

An unsecured line has no collateral to seize, so the risk model is cadence. For physical
infrastructure that is not a proxy for default, it is a direct one: revenue stops when the hardware
stops. `isCurrent()` freezes the line when the newest proven period ages past the stale window,
which makes the credit line a liveness check on the device.

This is not incidental. During development the registry accepted a real, fully-proven six-period
history and `CreditLine` still returned a limit of zero, because that revenue was six months stale.
The freeze fired before it was tested deliberately.

## Security inheritance

`AttestBase` is the hardened base contract from [Deadswitch](https://github.com/Nuel-osas/deadswitch),
written after finding two flaws in the tutorial's `USCBase` and filed upstream as
[gluwa/USC-Builder-Examples#37](https://github.com/gluwa/USC-Builder-Examples/issues/37):

- the action is derived from each log's own `topics[0]`, never trusted from the caller
- every log from the registered source is applied in order; foreign logs are skipped rather than
  reverted on, so a decoy log cannot censor a genuine payment
- `blockHeight` is threaded through so stale proofs cannot overwrite newer state

Two guards are specific to *creating money* rather than destroying it:

- only the registered revenue source can emit countable earnings — otherwise anyone deploys a
  contract that emits `PaymentMade` for their own address and mints themselves a revenue history
- each `(operator, period)` pair counts exactly once, across all transactions — otherwise one
  settlement is replayed into an unlimited limit

## Testing it yourself

Proof submission is permissionless, which is only true in practice if a stranger can afford the
transaction. So there is a faucet.

| Contract | Chain | Address |
|---|---|---|
| Faucet | Creditcoin CC3 | `0x751FD2650551FBecf2CEB3a1DAD32F2DEF63e07C` |

Open the [app](https://nuel-osas.github.io/ledgerline/app/), connect a wallet, and claim 0.5 CTC
(6 hour cooldown, ~4000 claims funded). Then prove any unproven settlement in the table: you pay
the gas, the registry accepts the proof from you rather than from us, and the operator's credit
limit rises.

Calling the faucet still costs a little gas, so from a completely empty wallet use the
[Creditcoin Discord faucet](https://discord.gg/creditcoin) once, then come back.

Everything above can be re-checked without trusting this repository:

    yarn verify

It re-reads every claim from public RPCs, including the on-chain transaction where a replayed
settlement was rejected.

## Scope

MVP, deliberately. One source chain, one revenue source, a single-lender pool, no interest, no
term, no secondary market, no liquidation. The submission is the primitive: **foreign revenue,
proven trustlessly, priced into unsecured credit.**

Track: **DePIN** — cross-chain data driving settlement and incentives across hardware networks.
