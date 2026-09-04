import { Contract, ethers, InterfaceAbi } from 'ethers';
import registryAbi from '../abi/IncomeRegistry.json';
import lineAbi from '../abi/CreditLine.json';
import { requireEnv } from './env';

requireEnv(['CREDITCOIN_RPC_URL', 'SOURCE_CHAIN_RPC_URL', 'INCOME_REGISTRY_ADDRESS', 'CREDIT_LINE_ADDRESS', 'WORKER_ADDRESS']);

/**
 * Is the live demo in a state a stranger can actually complete?
 *
 *   yarn preflight
 *
 * The onboarding flow dead-ends if every settlement is already proven, so this
 * checks the buffer as well as the plumbing.
 */
const g = (s: string) => `\x1b[32m${s}\x1b[0m`;
const r = (s: string) => `\x1b[31m${s}\x1b[0m`;
let bad = 0;
const ok = (m: string) => console.log(`  ${g('OK')}    ${m}`);
const no = (m: string) => { bad++; console.log(`  ${r('FIX')}   ${m}`); };

async function main() {
  const cc = new ethers.JsonRpcProvider(process.env.CREDITCOIN_RPC_URL);
  const src = new ethers.JsonRpcProvider(process.env.SOURCE_CHAIN_RPC_URL);
  const registry = new Contract(process.env.INCOME_REGISTRY_ADDRESS!, registryAbi as InterfaceAbi, cc);
  const line = new Contract(process.env.CREDIT_LINE_ADDRESS!, lineAbi as InterfaceAbi, cc);
  const worker = process.env.WORKER_ADDRESS!;

  console.log('\n  Ledgerline demo pre-flight\n  ' + '─'.repeat(50));

  const sig = ethers.id('PaymentMade(address,uint256,uint64)');
  const head = await src.getBlockNumber();
  const sources = [process.env.PAYER_ADDRESS!, process.env.PAYER2_ADDRESS!, process.env.PAYER3_ADDRESS!].filter(Boolean);
  let total = 0, unproven = 0;
  for (const addr of sources) {
    const logs = await src.getLogs({ address: addr, fromBlock: head - 40000, toBlock: head, topics: [sig, ethers.zeroPadValue(worker, 32)] });
    for (const l of logs) {
      total++;
      const [, period] = ethers.AbiCoder.defaultAbiCoder().decode(['uint256', 'uint64'], l.data);
      if (!(await registry.periodCountedBy(worker, addr, period))) unproven++;
    }
  }
  unproven >= 2
    ? ok(`${unproven} unproven settlements waiting (of ${total}). Visitors have something to prove.`)
    : no(`only ${unproven} unproven settlements. Onboarding step 3 dead-ends — emit more.`);

  const limit = await line.limitOf(worker);
  limit > 0n ? ok(`Credit limit is live: ${ethers.formatEther(limit)}`) : no('Credit limit is zero — the record may be stale.');

  const avail = await line.available(worker);
  const pool = await cc.getBalance(process.env.CREDIT_LINE_ADDRESS!);
  avail > 0n ? ok(`${ethers.formatEther(avail)} available to draw`) : no('Nothing available to draw.');

  const faucet = process.env.FAUCET_V2_ADDRESS!;
  const fbal = await cc.getBalance(faucet);
  fbal > ethers.parseEther('10')
    ? ok(`Faucet holds ${ethers.formatEther(fbal)} CTC (~${Math.floor(Number(ethers.formatEther(fbal)) / 0.5)} drips)`)
    : no('Faucet is nearly dry.');

  const relayer = await cc.getBalance(process.env.RELAYER_ADDRESS!);
  relayer > ethers.parseEther('1') ? ok(`Relayer holds ${ethers.formatEther(relayer)} CTC for its own gas`) : no('Relayer is out of gas.');

  console.log('  ' + '─'.repeat(50));
  console.log(bad === 0 ? `  ${g('Demo is ready for a stranger.')}\n` : `  ${r(`${bad} thing(s) to fix.`)}\n`);
  process.exit(bad === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
