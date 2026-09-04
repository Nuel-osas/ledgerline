'use client';

import { useCallback, useEffect, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Onboarding from './Onboarding';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { createPublicClient, decodeEventLog, formatEther, http, parseAbiItem, parseEther } from 'viem';
import { sepolia } from 'wagmi/chains';
import {
  CHAIN_KEY, CONTRACTS, DEMO_WORKER, FAUCET_ABI, LINE_ABI, PROVER, REGISTRY_ABI, SEPOLIA_RPC,
  RELAY, TEST_OPERATOR_KEY, creditcoinCC3,
} from '../chain';

const sepoliaClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
const PAYMENT_EVENT = parseAbiItem('event PaymentMade(address indexed worker, uint256 amount, uint64 period)');

const fmt = (v) => (v == null ? '—' : Number(formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: 2 }));
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');
const day = (p) => new Date(Number(p) * 1000).toISOString().slice(0, 10);

export default function Console() {
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const ccClient = usePublicClient({ chainId: creditcoinCC3.id });

  const [operator] = useState(DEMO_WORKER);
  const [record, setRecord] = useState(null);
  const [limit, setLimit] = useState(null);
  const [available, setAvailable] = useState(null);
  const [outstanding, setOutstanding] = useState(null);
  const [settlements, setSettlements] = useState([]);
  const [busy, setBusy] = useState(null);
  const [feed, setFeed] = useState([]);
  const [gas, setGas] = useState(null);
  const [provenThisSession, setProvenThisSession] = useState(false);

  const log = useCallback((msg, kind = 'info') => {
    setFeed((f) => [...f.slice(-40), { msg, kind, t: new Date().toLocaleTimeString() }]);
  }, []);

  // ---- read everything the operator's credit rests on -------------------
  const refresh = useCallback(async () => {
    if (!ccClient) return;
    try {
      const [rec, lim, avail, owed] = await Promise.all([
        ccClient.readContract({ address: CONTRACTS.registry, abi: REGISTRY_ABI, functionName: 'getRecord', args: [operator] }),
        ccClient.readContract({ address: CONTRACTS.creditLine, abi: LINE_ABI, functionName: 'limitOf', args: [operator] }),
        ccClient.readContract({ address: CONTRACTS.creditLine, abi: LINE_ABI, functionName: 'available', args: [operator] }),
        ccClient.readContract({ address: CONTRACTS.creditLine, abi: LINE_ABI, functionName: 'outstanding', args: [operator] }),
      ]);
      setRecord(rec); setLimit(lim); setAvailable(avail); setOutstanding(owed);
      if (address) setGas(await ccClient.getBalance({ address }));
    } catch { /* transient rpc */ }
  }, [ccClient, operator, address]);

  // ---- discover the operator's settlements on the source chain ----------
  const discover = useCallback(async () => {
    try {
      const head = await sepoliaClient.getBlockNumber();
      const sources = [
        [CONTRACTS.payer, 'Wireless coverage'],
        [CONTRACTS.payer2, 'Decentralised storage'],
        [CONTRACTS.payer3, 'Environmental sensors'],
      ];
      const logs = [];
      for (const [addr, net] of sources) {
        const found = await sepoliaClient.getLogs({
          address: addr, event: PAYMENT_EVENT, args: { worker: operator },
          fromBlock: head - 40000n > 0n ? head - 40000n : 0n, toBlock: head,
        });
        found.forEach((l) => logs.push(Object.assign(l, { network: net, source: addr })));
      }
      const rows = [];
      for (const l of logs) {
        const period = l.args.period;
        let proven = false;
        try {
          proven = await ccClient.readContract({
            address: CONTRACTS.registry, abi: REGISTRY_ABI, functionName: 'periodCountedBy',
            args: [operator, l.source, period],
          });
        } catch { /* ignore */ }
        rows.push({ hash: l.transactionHash, block: l.blockNumber, amount: l.args.amount, period, proven, network: l.network });
      }
      rows.sort((a, b) => Number(b.period - a.period));
      setSettlements(rows);
      const un = rows.filter((r) => !r.proven).length;
      log(`Found ${rows.length} settlements on Sepolia. ${un} not yet proven to Creditcoin.`, un ? 'warn' : 'ok');
    } catch (e) {
      log(`Could not read the source chain: ${e.shortMessage ?? e.message}`, 'err');
    }
  }, [ccClient, operator, log]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (ccClient) discover(); }, [ccClient]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const id = setInterval(refresh, 15000); return () => clearInterval(id); }, [refresh]);

  const wrongNetwork = isConnected && chainId !== creditcoinCC3.id;

  // ---- prove one settlement. anyone may do this. ------------------------
  const prove = async (row) => {
    if (!walletClient) { log('Connect a wallet to submit the proof.', 'err'); return; }
    if (wrongNetwork) { log(`Switch to ${creditcoinCC3.name} (chain ${creditcoinCC3.id}).`, 'err'); return; }
    setBusy(row.hash);
    try {
      log(`Fetching the Attestcoin proof for ${row.hash.slice(0, 10)}…`, 'step');
      const res = await fetch(`${PROVER}/api/v1/proof-by-tx/${CHAIN_KEY}/${row.hash}`);
      if (!res.ok) throw new Error(`prover returned ${res.status}. A very recent block needs ~8-10 min to be attested.`);
      const p = await res.json();
      log(`Proof received: Sepolia block ${p.headerNumber}, ${p.merkleProof.siblings.length} siblings.`, 'ok');

      const hash = await walletClient.writeContract({
        address: CONTRACTS.registry, abi: REGISTRY_ABI, functionName: 'execute',
        args: [BigInt(p.chainKey), BigInt(p.headerNumber), p.txBytes, p.merkleProof.root,
          p.merkleProof.siblings.map((s) => ({ hash: s.hash, isLeft: s.isLeft })),
          p.continuityProof.lowerEndpointDigest, p.continuityProof.roots],
        chain: creditcoinCC3, gas: 3_000_000n,
      });
      log(`Submitted to IncomeRegistry.execute(): ${hash.slice(0, 12)}…`, 'step');
      const receipt = await ccClient.waitForTransactionReceipt({ hash });
      for (const l of receipt.logs) {
        try {
          const ev = decodeEventLog({ abi: REGISTRY_ABI, data: l.data, topics: l.topics });
          if (ev.eventName === 'IncomeAttested') {
            log(`Attested +${fmt(ev.args.amount)} for period ${day(ev.args.period)}. Record now ${fmt(ev.args.totalReceived)} over ${ev.args.paymentCount} periods.`, 'kill');
          }
        } catch { /* not ours */ }
      }
      setProvenThisSession(true);
      await refresh(); await discover();
    } catch (e) {
      const m = e?.shortMessage || e?.details || e?.message || String(e);
      log(`Failed: ${m}`, 'err');
      if (/already counted/i.test(m)) log('That is the replay guard: one period counts exactly once.', 'info');
    } finally { setBusy(null); }
  };

  const draw = async () => {
    if (!walletClient) return;
    if (address?.toLowerCase() !== operator.toLowerCase()) {
      log('Only the operator can draw against their own line. You can still prove their revenue above.', 'warn');
      return;
    }
    setBusy('draw');
    try {
      const hash = await walletClient.writeContract({
        address: CONTRACTS.creditLine, abi: LINE_ABI, functionName: 'draw',
        args: [parseEther('50')], chain: creditcoinCC3, gas: 500_000n,
      });
      await ccClient.waitForTransactionReceipt({ hash });
      log('Drew 50 against proven revenue. Nothing pledged.', 'kill');
      refresh();
    } catch (e) { log(`Draw failed: ${e.shortMessage ?? e.message}`, 'err'); }
    finally { setBusy(null); }
  };

  // ---- gas, so a stranger can afford to submit a proof --------------------
  // Asking a wallet to sign for gas is a chicken and egg problem, so a relayer
  // pushes it instead. The visitor signs nothing and needs no starting balance.
  const claimGas = async () => {
    if (!address) return;
    setBusy('gas');
    try {
      log('Requesting gas. No signature needed for this step.', 'step');
      const res = await fetch(RELAY, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `relayer returned ${res.status}`);
      log(`Received ${j.amount} CTC. You can now submit a proof yourself.`, 'kill');
      setTimeout(refresh, 2500);
    } catch (e) {
      log(`Gas: ${e.message}`, /cooldown|enough gas/i.test(e.message) ? 'warn' : 'err');
    } finally { setBusy(null); }
  };

  const lowGas = gas != null && gas < 100_000_000_000_000_000n; // < 0.1 CTC
  const unproven = settlements.filter((s) => !s.proven);

  return (
    <>
      <nav className="nav">
        <div className="wrap nav-in">
          <a className="brand" href="../">
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" style={{ color: '#34d399' }}>
              <g fill="currentColor">
                <rect x="3" y="15" width="4.5" height="6" /><rect x="9.75" y="10.5" width="4.5" height="10.5" />
                <rect x="16.5" y="6" width="4.5" height="15" /><rect x="3" y="3" width="18" height="1.5" />
              </g>
            </svg>
            Ledgerline
          </a>
          <div className="nav-links">
            <span className="chip">CC3 · chain {creditcoinCC3.id}</span>
            <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
          </div>
        </div>
      </nav>

      <main className="wrap" style={{ paddingTop: 'var(--s7)', paddingBottom: 'var(--s8)' }}>
        <div className="kicker">Live on testnet</div>
        <h1 style={{ fontSize: 'clamp(30px,4.4vw,44px)', maxWidth: '20ch' }}>
          Prove this operator&rsquo;s revenue. Watch their credit rise.
        </h1>
        <p className="lead" style={{ marginTop: 'var(--s4)' }}>
          Proof submission is permissionless: there is no privileged relayer, so <em>you</em> can submit
          it with your own wallet. The registry authenticates the contract that emitted the revenue, not
          whoever brought the proof.
        </p>

        {wrongNetwork && (
          <div className="note" style={{ borderLeftColor: 'var(--warn)' }}>
            Wrong network. Ledgerline lives on <b>{creditcoinCC3.name}</b> (chain{' '}
            <code>{creditcoinCC3.id}</code>, gas in <code>{creditcoinCC3.nativeCurrency.symbol}</code>).{' '}
            <button className="btn btn--accent" style={{ marginLeft: 8, height: 32 }}
              onClick={() => switchChain({ chainId: creditcoinCC3.id })}>Switch network</button>
          </div>
        )}

        <Onboarding
          connected={isConnected}
          hasGas={!lowGas && gas != null}
          provenThisSession={provenThisSession}
          limit={limit}
          isOperator={address?.toLowerCase() === operator.toLowerCase()}
          unprovenCount={unproven.length}
          busy={busy}
          onGas={claimGas}
          onProve={() => { const next = settlements.find((x) => !x.proven); if (next) prove(next); }}
          onDraw={draw}
        />

        {isConnected && !wrongNetwork && (
          <div className="note" style={lowGas ? { borderLeftColor: 'var(--warn)' } : undefined}>
            <b>Gas:</b> your wallet holds {gas != null ? fmt(gas) : '—'} CTC.{' '}
            {lowGas ? 'Too little to submit a proof. ' : 'Enough to submit a proof. '}
            <button className="btn btn--accent" style={{ height: 30, padding: '0 12px', marginLeft: 6 }}
              onClick={claimGas} disabled={busy === 'gas'}>
              {busy === 'gas' ? 'Sending…' : 'Send me gas'}
            </button>
            <span style={{ display: 'block', marginTop: 8, fontSize: 13, color: 'var(--text-3)' }}>
              A relayer pushes it to you: you sign nothing and need no starting balance, because
              needing gas to ask for gas would defeat the point. The cooldown is enforced on-chain
              against the recipient, so the relayer holds no state.
            </span>
          </div>
        )}

        <div className="cols">
          <div className="card">
            <div className="card__head"><h3>Proven revenue</h3><span className="chip">Sepolia &rarr; CC3</span></div>
            <div className="card__body">
              <span className="lbl">Attested earnings</span>
              <div className="metric">{record ? fmt(record.totalReceived) : '—'}<span className="u">TST</span></div>
              <dl className="rows">
                <div className="row"><dt>Periods proven</dt><dd>{record ? String(record.paymentCount) : '—'}</dd></div>
                <div className="row"><dt>Not yet proven</dt>
                  <dd className={unproven.length ? '' : 'good'}>{unproven.length}</dd></div>
                <div className="row"><dt>Earning run-rate</dt>
                  <dd className="good">{record && record.periodsCovered > 0n
                    ? `${fmt(record.totalReceived / record.periodsCovered)} / period` : '—'}</dd></div>
                <div className="row"><dt>Periods covered</dt>
                  <dd>{record ? String(record.periodsCovered) : '—'}</dd></div>
                <div className="row"><dt>Networks paying them</dt>
                  <dd className={record && record.networkCount > 1 ? 'good' : ''}>
                    {record ? String(record.networkCount) : '—'}
                  </dd></div>
                <div className="row"><dt>Operator</dt><dd>{short(operator)}</dd></div>
              </dl>
            </div>
          </div>

          <div className="card">
            <div className="card__head"><h3>Credit granted</h3><span className="chip">Creditcoin CC3</span></div>
            <div className="card__body">
              <span className="lbl">Unsecured limit</span>
              <div className={`metric ${limit && limit > 0n ? 'good' : 'none'}`}>
                {limit != null ? fmt(limit) : '—'}<span className="u">TST</span>
              </div>
              <dl className="rows">
                <div className="row"><dt>Collateral posted</dt><dd>none</dd></div>
                <div className="row"><dt>Drawn</dt><dd>{fmt(outstanding)} TST</dd></div>
                <div className="row"><dt>Available</dt><dd className="good">{fmt(available)} TST</dd></div>
              </dl>
              <button className="btn btn--accent" style={{ marginTop: 'var(--s4)', width: '100%' }}
                onClick={draw} disabled={!isConnected || busy === 'draw'}>
                {busy === 'draw' ? 'Drawing…' : 'Draw 50 against proven revenue'}
              </button>
              {isConnected && address?.toLowerCase() !== operator.toLowerCase() && (
                <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 'var(--s3)', lineHeight: 1.55 }}>
                  Drawing is scoped to the borrower, by design. To exercise it, import the demo
                  operator below: it is a throwaway testnet key published on purpose so every
                  feature works for you.
                </p>
              )}
            </div>
          </div>
        </div>

        <section style={{ borderTop: 0, paddingTop: 'var(--s7)' }}>
          <h2>Settlements on the source chain</h2>
          <p className="lead">
            Discovered by reading <code>PaymentMade</code> logs on Sepolia. Each unproven row is a real
            transaction whose Attestcoin proof has not yet been submitted to Creditcoin.
          </p>
          <div className="scroll-x">
            <table>
              <tbody>
                <tr><th>Network</th><th>Period</th><th>Amount</th><th>Sepolia tx</th><th>State</th><th /></tr>
                {settlements.length === 0 && (
                  <tr><td colSpan={6} className="n">Reading the source chains…</td></tr>
                )}
                {settlements.map((s) => (
                  <tr key={s.hash}>
                    <td className="n">{s.network}</td>
                    <td className="n">{day(s.period)}</td>
                    <td>{fmt(s.amount)} TST</td>
                    <td><a href={`https://sepolia.etherscan.io/tx/${s.hash}`} target="_blank" rel="noreferrer">{s.hash.slice(0, 14)}…</a></td>
                    <td style={{ color: s.proven ? 'var(--accent)' : 'var(--text-3)' }}>{s.proven ? 'proven' : 'unproven'}</td>
                    <td>
                      {!s.proven && (
                        <button className="btn btn--accent" style={{ height: 30, padding: '0 14px' }}
                          onClick={() => prove(s)} disabled={!isConnected || busy === s.hash}>
                          {busy === s.hash ? 'Proving…' : 'Prove it'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <pre style={{ maxHeight: 260, overflowY: 'auto' }}>
            {feed.length === 0 ? 'Idle. Connect a wallet and prove a settlement.' :
              feed.map((f, i) => `${f.t}  ${f.msg}`).join('\n')}
          </pre>

          <div className="note">
            A period counts exactly once, across every transaction. Proving the same settlement twice
            reverts with <code>Period already counted</code>, which is the guard that stops one settlement
            being replayed into an unlimited credit limit.
          </div>
        </section>
      </main>

      <section style={{ borderTop: 0, paddingTop: 0 }}>
        <div className="wrap">
        <div className="note" style={{ maxWidth: '70ch' }}>
          <b>Try every feature, including the draw.</b>
          <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6 }}>
            Proving revenue works from any wallet, because submission is permissionless. Drawing is
            scoped to the borrower, because credit belongs to whoever earned it. So that the
            restriction does not stop you testing, here is the demo operator&rsquo;s key. It is a
            throwaway on testnet and holds nothing of value anywhere.
          </p>
          <code style={{ display: 'block', marginTop: 10, padding: '10px 12px', background: 'var(--well)',
            border: '1px solid var(--line)', fontSize: 12, wordBreak: 'break-all' }}>
            {TEST_OPERATOR_KEY}
          </code>
          <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
            Import it into MetaMask (account menu &rarr; Import Account), reconnect, and the draw
            button becomes live. Never reuse a published key for anything real.
          </p>
        </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          Ledgerline &middot; testnet only. &nbsp;
          <a href="../">Overview</a> &middot;{' '}
          <a href="https://github.com/Nuel-osas/ledgerline">GitHub</a> &middot;{' '}
          <a href={`${creditcoinCC3.blockExplorers.default.url}/address/${CONTRACTS.registry}`}>IncomeRegistry</a>
        </div>
      </footer>
    </>
  );
}
