import { Contract, ethers, InterfaceAbi } from 'ethers';
import registryAbi from '../abi/IncomeRegistry.json';
import lineAbi from '../abi/CreditLine.json';
import { CORE, requireEnv } from './env';

requireEnv([...CORE, 'INCOME_REGISTRY_ADDRESS', 'CREDIT_LINE_ADDRESS', 'WORKER_ADDRESS']);

const f = (v: bigint) => Number(ethers.formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: 2 });

async function main() {
  const cc = new ethers.JsonRpcProvider(process.env.CREDITCOIN_RPC_URL);
  const worker = process.argv[2] ?? process.env.WORKER_ADDRESS!;
  const registry = new Contract(process.env.INCOME_REGISTRY_ADDRESS!, registryAbi as InterfaceAbi, cc);
  const line = new Contract(process.env.CREDIT_LINE_ADDRESS!, lineAbi as InterfaceAbi, cc);

  const r = await registry.getRecord(worker);
  const [avg, limit, avail, owed, current] = await Promise.all([
    registry.averagePayment(worker),
    line.limitOf(worker),
    line.available(worker),
    line.outstanding(worker),
    line.isCurrent(worker),
  ]);

  console.log(`\n  Borrower ${worker}`);
  console.log(`  ${'-'.repeat(58)}`);
  console.log(`  Collateral posted        none`);
  console.log(`  Proven income            ${f(r.totalReceived)} over ${r.paymentCount} periods`);
  console.log(`  Average per period       ${f(avg)}`);
  console.log(`  Record current           ${current ? 'yes' : 'no (stale)'}`);
  console.log(`  ${'-'.repeat(58)}`);
  console.log(`  Credit limit             ${f(limit)}`);
  console.log(`  Drawn                    ${f(owed)}`);
  console.log(`  Available to draw        ${f(avail)}\n`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
