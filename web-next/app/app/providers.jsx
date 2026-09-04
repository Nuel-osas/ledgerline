'use client';

import '@rainbow-me/rainbowkit/styles.css';
import { RainbowKitProvider, getDefaultConfig, darkTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { creditcoinCC3 } from '../chain';

const config = getDefaultConfig({
  appName: 'Ledgerline',
  projectId: 'ledgerline_cc3_testnet_demo',
  chains: [creditcoinCC3],
  ssr: true,
});

export default function Providers({ children }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={qc}>
        <RainbowKitProvider
          initialChain={creditcoinCC3}
          theme={darkTheme({
            accentColor: '#34d399',
            accentColorForeground: '#04140d',
            borderRadius: 'small',
            overlayBlur: 'small',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
