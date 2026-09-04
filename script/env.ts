import dotenv from 'dotenv';
dotenv.config({ override: true });

export function requireEnv(keys: string[]): void {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`\nMissing required environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}\nCopy .env.example to .env and fill it in.\n`);
    process.exit(1);
  }
}
export const CORE = ['SOURCE_CHAIN_KEY', 'PROOF_BUILDER_URL', 'CREDITCOIN_RPC_URL', 'SOURCE_CHAIN_RPC_URL', 'CREDITCOIN_WALLET_PRIVATE_KEY'];
