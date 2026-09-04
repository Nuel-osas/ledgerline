import { defineChain } from 'viem';

/** Creditcoin CC3 Testnet — declared explicitly so the wallet shows a real
 *  network name, the correct native currency and a working explorer at signing. */
export const creditcoinCC3 = defineChain({
  id: 102031,
  name: 'Creditcoin CC3 Testnet',
  network: 'creditcoin-cc3-testnet',
  nativeCurrency: { name: 'Creditcoin', symbol: 'CTC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.cc3-testnet.creditcoin.network'] },
    public: { http: ['https://rpc.cc3-testnet.creditcoin.network'] },
  },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://creditcoin-testnet.blockscout.com' } },
  testnet: true,
});

export const CONTRACTS = {
  faucet: '0x751FD2650551FBecf2CEB3a1DAD32F2DEF63e07C',   // CC3, gas for testers
  payer: '0x4371bD116de786f44D0b0f144c7F5606757A088B',      // Sepolia
  registry: '0x58Fde1CaF19e98690Bf301C349ddf4e0aBb6f875',   // CC3
  creditLine: '0x31f169EC7C69144aEbB04091925d66De1FD4bDdb', // CC3
  creditToken: '0x99D09557A6b50DEF18666E75eaABC1DC32d43555',// CC3
};

export const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
export const PROVER = 'https://prover.cc3-testnet.creditcoin.network';
export const CHAIN_KEY = 1;
export const FAUCET_ABI = [
  { type: 'function', name: 'claim', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'dripAmount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'claimableIn', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
];

export const PAYER_ABI = [
  { type: 'event', name: 'PaymentMade', inputs: [
      { name: 'worker', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256' },
      { name: 'period', type: 'uint64' } ] },
];

export const DEMO_WORKER = '0xEbF0F7718A5f42BdCE7F11B2982D550D44f180b4';

export const REGISTRY_ABI = [
  { type: 'function', name: 'getRecord', stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'tuple', components: [
      { name: 'totalReceived', type: 'uint256' },
      { name: 'paymentCount', type: 'uint64' },
      { name: 'firstPeriod', type: 'uint64' },
      { name: 'lastPeriod', type: 'uint64' },
      { name: 'lastAttestedBlock', type: 'uint64' },
      { name: 'exists', type: 'bool' },
    ]}] },
  { type: 'function', name: 'averagePayment', stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'execute', stateMutability: 'nonpayable',
    inputs: [
      { name: 'chainKey', type: 'uint64' }, { name: 'blockHeight', type: 'uint64' },
      { name: 'encodedTransaction', type: 'bytes' }, { name: 'merkleRoot', type: 'bytes32' },
      { name: 'siblings', type: 'tuple[]', components: [{ name: 'hash', type: 'bytes32' }, { name: 'isLeft', type: 'bool' }] },
      { name: 'lowerEndpointDigest', type: 'bytes32' }, { name: 'continuityRoots', type: 'bytes32[]' },
    ], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'periodCounted', stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'uint64' }], outputs: [{ type: 'bool' }] },
  { type: 'event', name: 'IncomeAttested', inputs: [
      { name: 'worker', type: 'address', indexed: true }, { name: 'amount', type: 'uint256' },
      { name: 'period', type: 'uint64' }, { name: 'totalReceived', type: 'uint256' },
      { name: 'paymentCount', type: 'uint64' } ] },
];

export const LINE_ABI = [
  { type: 'function', name: 'limitOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'available', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'outstanding', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'isCurrent', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'multiplierBps', stateMutability: 'pure', inputs: [{ type: 'uint64' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'draw', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'event', name: 'Drawn', inputs: [
      { name: 'borrower', type: 'address', indexed: true }, { name: 'amount', type: 'uint256' },
      { name: 'limit', type: 'uint256' }, { name: 'outstanding', type: 'uint256' } ] },
];
