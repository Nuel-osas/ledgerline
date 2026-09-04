import { Contract, ethers, InterfaceAbi } from 'ethers';
import { chainInfo, proofProvider } from '@gluwa/usc-sdk';
import registryAbi from '../abi/IncomeRegistry.json';
import { CORE, requireEnv } from './env';

requireEnv([...CORE, 'INCOME_REGISTRY_ADDRESS']);

/**
 * Prove one or more PaymentMade transactions from the source chain to the
 * IncomeRegistry on Creditcoin.
 *
 *   yarn attest <sepolia_tx_hash> [more hashes...]
 *
 * Permissionless: anyone can submit a worker's proof. The registry authenticates
 * the emitting contract, not the submitter.
 */
async function main() {
  const hashes = process.argv.slice(2);
  if (!hashes.length) {
    console.error('Usage: yarn attest <sepolia_tx_hash> [more...]');
    process.exit(1);
  }

  const chainKey = Number(process.env.SOURCE_CHAIN_KEY);
  const cc = new ethers.JsonRpcProvider(process.env.CREDITCOIN_RPC_URL);
  const src = new ethers.JsonRpcProvider(process.env.SOURCE_CHAIN_RPC_URL);
  const wallet = new ethers.Wallet(process.env.CREDITCOIN_WALLET_PRIVATE_KEY!, cc);
  const registry = new Contract(process.env.INCOME_REGISTRY_ADDRESS!, registryAbi as InterfaceAbi, wallet);

  const pb = new proofProvider.service.ProofBuilder(chainKey, process.env.PROOF_BUILDER_URL!);
  const info = new chainInfo.PrecompileChainInfoProvider(cc);
  const latest = await info.getLatestAttestedHeightAndHash(chainKey);
  console.log(`Latest attested Sepolia height: ${latest.height}\n`);

  for (const txHash of hashes) {
    const tx = await src.getTransaction(txHash);
    if (!tx?.blockNumber) { console.log(`skip ${txHash.slice(0, 12)}… not mined`); continue; }
    process.stdout.write(`${txHash.slice(0, 12)}… block ${tx.blockNumber} `);

    await pb.waitUntilHeightAttested(chainKey, tx.blockNumber, 15_000, 1_200_000);
    const r = await pb.getProof(txHash);
    if (!r.success) { console.log(`proof failed: ${r.error}`); continue; }
    const p = r.data!;

    try {
      const t = await registry.execute(
        p.chainKey, p.headerNumber, p.txBytes, p.merkleProof.root,
        p.merkleProof.siblings.map((s: any) => [s.hash, s.isLeft]),
        p.continuityProof.lowerEndpointDigest, p.continuityProof.roots,
        { gasLimit: 3_000_000 }
      );
      const rec = await t.wait();
      for (const l of rec!.logs) {
        try {
          const parsed = registry.interface.parseLog(l);
          if (parsed?.name === 'IncomeAttested') {
            console.log(`-> +${ethers.formatEther(parsed.args.amount)} for period ${parsed.args.period} | total ${ethers.formatEther(parsed.args.totalReceived)} over ${parsed.args.paymentCount} payments`);
          }
        } catch { /* not ours */ }
      }
    } catch (e: any) {
      console.log(`-> ${e.reason ?? e.shortMessage ?? e.message}`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
