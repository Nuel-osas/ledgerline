import './landing.css';

export const metadata = {
  title: 'Ledgerline: credit priced from income proven on another chain',
  description:
    'A worker paid in stablecoins on Ethereum proves that income to Creditcoin through Attestcoin, and borrows against it without posting collateral.',
  icons: {
    icon:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' fill='%2309090b'/%3E%3Cg fill='%2334d399'%3E%3Crect x='3' y='15' width='4.5' height='6'/%3E%3Crect x='9.75' y='10.5' width='4.5' height='10.5'/%3E%3Crect x='16.5' y='6' width='4.5' height='15'/%3E%3Crect x='3' y='3' width='18' height='1.5'/%3E%3C/g%3E%3C/svg%3E",
  },
};

export const viewport = { themeColor: '#09090b' };

export default function RootLayout({ children }) {
  return (
    <html lang="en"><body>{children}</body></html>
  );
}
