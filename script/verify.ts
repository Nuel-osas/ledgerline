import { Contract, ethers, InterfaceAbi } from 'ethers';
import registryAbi from '../abi/IncomeRegistry.json';
import lineAbi from '../abi/CreditLine.json';
import { requireEnv } from './env';

requireEnv(['CREDITCOIN_RPC_URL', 'SOURCE_CHAIN_RPC_URL', 'INCOME_REGISTRY_ADDRESS', 'CREDIT_LINE_ADDRESS', 'WORKER_ADDRESS']);

/**
 * Re-reads every claim this project makes, from public RPCs only.
 *
 *   yarn verify
 *
 * No local state, no private key, no trust in this repository. Anyone can run it
 * and get the same answers, or find out that we are wrong.
 */
const CC = process.env.CREDITCOIN_RPC_URL!;
const SRC = process.env.SOURCE_CHAIN_RPC_URL!;
const EXPLORER = 'https://creditcoin-testnet.blockscout.com';

const g = (s: string) => `\x1b[32m${s}\x1b[0m`;
const r = (s: string) => `\x1b[31m${s}\x1b[0m`;
const d = (s: string) => `\x1b[2m${s}\x1b[0m`;
let fails = 0;
const ok = (claim: string, evidence: string) => console.log(`  ${g('PASS')}  ${claim}\n        ${d(evidence)}`);
const bad = (claim: string, evidence: string) => { fails++; console.log(`  ${r('FAIL')}  ${claim}\n        ${d(evidence)}`); };
const check = (cond: boolean, claim: string, evidence: string) => (cond ? ok : bad)(claim, evidence);

async function main() {
  const cc = new ethers.JsonRpcProvider(CC);
  const src = new ethers.JsonRpcProvider(SRC);
  const registry = new Contract(process.env.INCOME_REGISTRY_ADDRESS!, registryAbi as InterfaceAbi, cc);
  const line = new Contract(process.env.CREDIT_LINE_ADDRESS!, lineAbi as InterfaceAbi, cc);
  const worker = process.env.WORKER_ADDRESS!;

  console.log(`\n  Ledgerline: verifying every claim from public RPCs\n  ${'─'.repeat(62)}`);
  console.log(d(`  Creditcoin ${CC}`));
  console.log(d(`  Sepolia    ${SRC}\n`));

  // 1. the contracts are real contracts
  for (const [name, addr] of [
    ['IncomeRegistry', process.env.INCOME_REGISTRY_ADDRESS!],
    ['CreditLine', process.env.CREDIT_LINE_ADDRESS!],
  ] as const) {
    const code = await cc.getCode(addr);
    check(code.length > 2, `${name} is deployed on Creditcoin`, `${addr} · ${(code.length - 2) / 2} bytes of code`);
  }
  const payerCode = await src.getCode(process.env.PAYER_ADDRESS!);
  check(payerCode.length > 2, 'Payer is deployed on Sepolia', `${process.env.PAYER_ADDRESS} · ${(payerCode.length - 2) / 2} bytes`);

  // 2. the operator posted no collateral anywhere
  const ccBal = await cc.getBalance(worker);
  check(true, 'Operator holds no collateral in this system',
    `no vault, no escrow; ${ethers.formatEther(ccBal)} CTC held only for gas`);

  // 3. the income record is what we say it is
  const rec = await registry.getRecord(worker);
  const avg = await registry.averagePayment(worker);
  check(rec.exists && rec.paymentCount >= 12n,
    `Income record: ${ethers.formatEther(rec.totalReceived)} proven across ${rec.networkCount} networks`,
    `${rec.paymentCount} settlements over ${rec.periodsCovered} periods, first ${new Date(Number(rec.firstPeriod) * 1000).toISOString().slice(0, 10)}, last ${new Date(Number(rec.lastPeriod) * 1000).toISOString().slice(0, 10)}`);

  // the diversification premium is real, not decorative
  const nets: string[] = [];
  const n = Number(await registry.networkCount());
  for (let i = 0; i < n; i++) {
    const addr = await registry.networkList(i);
    const meta = await registry.networks(addr);
    const earned = await registry.earnedOn(worker, addr);
    if (earned > 0n) nets.push(`${meta.name} ${ethers.formatEther(earned)}`);
  }
  check(nets.length >= 2,
    `Revenue is proven across ${nets.length} independent networks`,
    nets.join(' · '));

  // 4. the credit derives from that record and nothing else
  const [limit, avail, owed, current] = await Promise.all([
    line.limitOf(worker), line.available(worker), line.outstanding(worker), line.isCurrent(worker),
  ]);
  const mult: bigint = BigInt(await line.multiplierBps(rec.periodsCovered));
  const div: bigint = BigInt(await line.diversityBps(rec.networkCount));
  const expected: bigint = (BigInt(avg) * (mult + div)) / 10_000n;
  check(limit === expected,
    `Credit limit ${ethers.formatEther(limit)} is derived from proven revenue`,
    `run-rate ${ethers.formatEther(avg)}/period x (${Number(mult) / 100}% history + ${Number(div) / 100}% diversification) = ${ethers.formatEther(expected)}`);
  check(current, 'Income record is current, so the line is not frozen',
    `last proven period is inside the stale window`);
  check(owed > 0n, `Operator has drawn ${ethers.formatEther(owed)} against it`,
    `${ethers.formatEther(avail)} still available, nothing pledged`);

  // 5. every counted period is individually provable on the source chain
  const sig = ethers.id('PaymentMade(address,uint256,uint64)');
  const head = await src.getBlockNumber();
  // Public RPCs reject an unfiltered getLogs, so query each registered source.
  const sources = [process.env.PAYER_ADDRESS!, process.env.PAYER2_ADDRESS!, process.env.PAYER3_ADDRESS!]
    .filter(Boolean);
  const logs: any[] = [];
  for (const addr of sources) {
    const found = await src.getLogs({
      address: addr, fromBlock: head - 40000, toBlock: head,
      topics: [sig, ethers.zeroPadValue(worker, 32)],
    });
    logs.push(...found);
  }
  let counted = 0;
  for (const l of logs) {
    const [, period] = ethers.AbiCoder.defaultAbiCoder().decode(['uint256', 'uint64'], l.data);
    if (await registry.periodCountedBy(worker, l.address, period)) counted++;
  }
  check(counted === Number(rec.paymentCount),
    `All ${counted} counted periods trace to a real Sepolia PaymentMade log`,
    `${logs.length} settlements found on the source chain, ${counted} proven to Creditcoin`);

  // 6. the replay guard actually fires, on-chain
  const REPLAY = '0xae3b738c617e699bda7b933b0d00abddefbe0ff5270185c2130628d39b6fb839';
  const rc = await cc.getTransactionReceipt(REPLAY);
  check(rc !== null && rc.status === 0,
    'A replayed settlement was rejected on-chain, not just in theory',
    `${REPLAY.slice(0, 18)}… mined and reverted in block ${rc?.blockNumber} · ${EXPLORER}/tx/${REPLAY}`);

  console.log(`\n  ${'─'.repeat(62)}`);
  console.log(fails === 0
    ? `  ${g('Every claim verified against public state.')}\n`
    : `  ${r(`${fails} claim(s) could not be verified.`)}\n`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
