import Providers from './providers';

export const metadata = {
  title: 'Ledgerline: prove revenue, unlock credit',
  description:
    'Prove a DePIN operator’s cross-chain revenue through Attestcoin and watch their unsecured credit limit rise. Proof submission is permissionless: anyone can do it.',
};

export default function AppLayout({ children }) {
  return <Providers>{children}</Providers>;
}
