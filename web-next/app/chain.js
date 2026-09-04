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

/**
 * The demo operator. A throwaway testnet key, published deliberately so that a
 * visitor can exercise every feature, including drawing credit, which is scoped
 * to the borrower by design. It holds no value on any network.
 */
export const TEST_OPERATOR_KEY =
  '0x4ba1f89b3fc3a0c0641070c4f30e8d1084ecb6ce85dc5e8e08f0785b61a24b82';

export const CONTRACTS = {
  faucet: '0x751FD2650551FBecf2CEB3a1DAD32F2DEF63e07C',   // CC3, gas for testers
  payer: '0x4371bD116de786f44D0b0f144c7F5606757A088B',      // Sepolia, wireless
  payer2: '0xb6a36a6aaA7c73E3AA83004600EB20AC761317a4',     // Sepolia, storage
  payer3: '0xaA6F1ab69B78AA22FC48dD860296Fb752bd6c56A',     // Sepolia, sensors
  registry: '0xDcd6ba44474F461A4cEF01F824B05DA582B763f9',   // CC3, multi-network
  creditLine: '0xa2f7fe0dEBd6b341a57D7CEBa5b629BC437CEfeA', // CC3, prices diversification
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
      { name: 'networkCount', type: 'uint8' },
      { name: 'periodsCovered', type: 'uint64' },
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
  { type: 'function', name: 'networkCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'networks', stateMutability: 'view',
    inputs: [{ type: 'address' }], outputs: [{ name: 'name', type: 'string' }, { name: 'registered', type: 'bool' }] },
  { type: 'function', name: 'earnedOn', stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'periodCounted', stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'uint64' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'periodCountedBy', stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint64' }], outputs: [{ type: 'bool' }] },
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
  { type: 'function', name: 'diversityBps', stateMutability: 'pure', inputs: [{ type: 'uint8' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'draw', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'event', name: 'Drawn', inputs: [
      { name: 'borrower', type: 'address', indexed: true }, { name: 'amount', type: 'uint256' },
      { name: 'limit', type: 'uint256' }, { name: 'outstanding', type: 'uint256' } ] },
];
