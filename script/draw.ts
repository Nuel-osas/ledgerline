import { Contract, ethers, InterfaceAbi } from 'ethers';
import lineAbi from '../abi/CreditLine.json';
import { CORE, requireEnv } from './env';

requireEnv([...CORE, 'CREDIT_LINE_ADDRESS', 'CREDIT_TOKEN_ADDRESS', 'WORKER_PRIVATE_KEY']);

/** The borrower draws against proven income. Nothing is pledged. */
async function main() {
  const amount = process.argv[2];
  if (!amount) { console.error('Usage: yarn draw <amount>'); process.exit(1); }

  const cc = new ethers.JsonRpcProvider(process.env.CREDITCOIN_RPC_URL);
  const borrower = new ethers.Wallet(process.env.WORKER_PRIVATE_KEY!, cc);
  const line = new Contract(process.env.CREDIT_LINE_ADDRESS!, lineAbi as InterfaceAbi, borrower);
  const token = new Contract(process.env.CREDIT_TOKEN_ADDRESS!, ['function balanceOf(address) view returns (uint256)'], cc);

  const before = await token.balanceOf(borrower.address);
  console.log(`Borrower holdings before: ${ethers.formatEther(before)}`);

  const tx = await line.draw(ethers.parseEther(amount), { gasLimit: 500_000 });
  console.log('Drawing…', tx.hash);
  const rec = await tx.wait();
  for (const l of rec!.logs) {
    try {
      const p = line.interface.parseLog(l);
      if (p?.name === 'Drawn') {
        console.log(`Drawn ${ethers.formatEther(p.args.amount)} against a limit of ${ethers.formatEther(p.args.limit)} — no collateral posted.`);
      }
    } catch { /* not ours */ }
  }
  console.log(`Borrower holdings after : ${ethers.formatEther(await token.balanceOf(borrower.address))}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
