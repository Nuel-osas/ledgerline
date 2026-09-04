import { ethers } from 'ethers';

/**
 * Gas relayer.
 *
 * Claiming gas by transaction is a chicken and egg problem: you need gas to ask
 * for gas. This pushes a small amount of CTC to a visitor's wallet so they can
 * submit an Attestcoin proof themselves, without signing anything first.
 *
 * The cooldown is enforced on-chain against the RECIPIENT, so this endpoint holds
 * no state and cannot be spammed into emptying the faucet.
 */
const FAUCET = '0xCEA6067E9530e11f914A524Cc1e63F3C441b4E25';
const RPC = 'https://rpc.cc3-testnet.creditcoin.network';
const ABI = [
  'function dripTo(address to)',
  'function claimableIn(address who) view returns (uint256)',
  'function dripAmount() view returns (uint256)',
];

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
};

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { address } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Not a valid address' });
    }

    const provider = new ethers.JsonRpcProvider(RPC);
    const faucet = new ethers.Contract(FAUCET, ABI, provider);

    const wait = await faucet.claimableIn(address);
    if (wait > 0n) {
      const mins = Math.ceil(Number(wait) / 60);
      return res.status(429).json({ error: `On cooldown for another ${mins} minute${mins === 1 ? '' : 's'}.` });
    }

    const bal = await provider.getBalance(address);
    const drip = await faucet.dripAmount();
    if (bal > drip * 4n) {
      return res.status(400).json({ error: 'That wallet already has enough gas to submit a proof.' });
    }

    const key = process.env.RELAYER_PRIVATE_KEY;
    if (!key) return res.status(500).json({ error: 'Relayer is not configured' });

    const signer = new ethers.Wallet(key, provider);
    const tx = await faucet.connect(signer).dripTo(address, { gasLimit: 120000 });
    const receipt = await tx.wait();

    return res.status(200).json({
      ok: true,
      hash: tx.hash,
      block: receipt.blockNumber,
      amount: ethers.formatEther(drip),
      explorer: `https://creditcoin-testnet.blockscout.com/tx/${tx.hash}`,
    });
  } catch (e) {
    return res.status(500).json({ error: e.shortMessage ?? e.message ?? 'Relayer failed' });
  }
}
