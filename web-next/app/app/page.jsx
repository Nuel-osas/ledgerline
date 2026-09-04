'use client';

import { useCallback, useEffect, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { createPublicClient, decodeEventLog, formatEther, http, parseAbiItem, parseEther } from 'viem';
import { sepolia } from 'wagmi/chains';
import {
  CHAIN_KEY, CONTRACTS, DEMO_WORKER, LINE_ABI, PROVER, REGISTRY_ABI, SEPOLIA_RPC, creditcoinCC3,
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
    } catch { /* transient rpc */ }
  }, [ccClient, operator]);

  // ---- discover the operator's settlements on the source chain ----------
  const discover = useCallback(async () => {
    try {
      const head = await sepoliaClient.getBlockNumber();
      const logs = await sepoliaClient.getLogs({
        address: CONTRACTS.payer, event: PAYMENT_EVENT, args: { worker: operator },
        fromBlock: head - 40000n > 0n ? head - 40000n : 0n, toBlock: head,
      });
      const rows = [];
      for (const l of logs) {
        const period = l.args.period;
        let proven = false;
        try {
          proven = await ccClient.readContract({
            address: CONTRACTS.registry, abi: REGISTRY_ABI, functionName: 'periodCounted', args: [operator, period],
          });
        } catch { /* ignore */ }
        rows.push({ hash: l.transactionHash, block: l.blockNumber, amount: l.args.amount, period, proven });
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
              <button className="btn" style={{ marginTop: 'var(--s4)', width: '100%' }}
                onClick={draw} disabled={!isConnected || busy === 'draw'}>
                {busy === 'draw' ? 'Drawing…' : 'Draw 50 (operator only)'}
              </button>
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
                <tr><th>Period</th><th>Amount</th><th>Sepolia tx</th><th>State</th><th /></tr>
                {settlements.length === 0 && (
                  <tr><td colSpan={5} className="n">Reading the source chain…</td></tr>
                )}
                {settlements.map((s) => (
                  <tr key={s.hash}>
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
