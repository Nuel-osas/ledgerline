import Mark from './Mark';

const CC = 'https://creditcoin-testnet.blockscout.com';
const SEP = 'https://sepolia.etherscan.io';

export default function Home() {
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>

      <nav className="nav">
        <div className="wrap nav-in">
          <a className="brand" href="#top"><Mark size={24} /> Ledgerline</a>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#proof">Proof</a>
            <a href="#risk">Risk</a>
            <a className="btn" href="https://github.com/Nuel-osas/ledgerline">Code</a>
          </div>
        </div>
      </nav>

      <main id="main">
        <div className="wrap hero" id="top">
          <div className="kicker">BUIDL CTC 2026 · Attestcoin Protocol</div>
          <h1>A node that earns is collateral, if you can prove it.</h1>
          <p className="sub">
            A DePIN operator earns revenue on one chain and has nothing to pledge on another. Ledgerline
            proves that revenue across the gap with an Attestcoin receipt, and finances more hardware
            against it. No collateral is posted, at any point.
          </p>
          <div className="cta">
            <a className="btn btn--accent" href="#proof">See the live position</a>
            <a className="btn" href="https://github.com/Nuel-osas/ledgerline">Read the contracts</a>
          </div>
        </div>

        <section id="problem">
          <div className="wrap">
            <h2>Hardware that earns cannot borrow against what it earns.</h2>
            <p className="lead">
              A wireless hotspot, a solar meter, a storage node: each settles its revenue on whichever
              chain its network runs on. To grow, the operator needs capital, and under any collateralised
              design they cannot get it, because they hold nothing on the lending chain. What they have is
              an earnings record, and moving that record across has always needed a trusted party: a
              bridge, an oracle committee, an attester of record.
            </p>
            <p className="lead">
              Attestcoin removes that party. The lender verifies the device&rsquo;s foreign revenue
              directly, without trusting the network that reported it, and without the operator moving a
              single token.
            </p>
          </div>
        </section>

        <section id="how">
          <div className="wrap">
            <h2>How it works</h2>
            <ol className="steps">
              <li>
                The network settles the operator&rsquo;s revenue on Ethereum Sepolia and emits{' '}
                <code>PaymentMade(operator, amount, period)</code>. It never touches Creditcoin, signs
                nothing here, and bridges no token.
              </li>
              <li>
                Anyone fetches an inclusion and continuity proof for that transaction and submits it to{' '}
                <code>IncomeRegistry.execute()</code> on Creditcoin.
              </li>
              <li>
                The <code>0x0FD2</code> precompile verifies the proof synchronously, in that same
                transaction. The registry authenticates the emitting contract and folds the payment into
                a record: total received, payment count, first and last period.
              </li>
              <li>
                <code>CreditLine</code> reads that record. Not a balance. Not a collateral ratio. Two
                proven earning periods buys a quarter of a period of credit; six or more buys
                1.25&times; &mdash; enough to fund the next unit of hardware.
              </li>
              <li>The borrower draws. Nothing is pledged.</li>
            </ol>
            <div className="note">
              Only a fact crosses chains. No token ever does.
            </div>
          </div>
        </section>

        <section id="proof">
          <div className="wrap">
            <h2>An operator that held nothing, financing 500.</h2>
            <p className="lead">
              A real position on live testnets. The operator posted no collateral on Creditcoin, on
              Ethereum, or anywhere else. Twelve fortnightly settlements, proven one at a time.
            </p>
            <div className="cols">
              <div className="card">
                <div className="card__head">
                  <h3>Proven income</h3><span className="chip">Sepolia &rarr; CC3</span>
                </div>
                <div className="card__body">
                  <span className="lbl">Revenue proven over 12 periods</span>
                  <div className="metric">6,000<span className="u">TST</span></div>
                  <dl className="rows">
                    <div className="row"><dt>Settlements proven</dt><dd>12</dd></div>
                    <div className="row"><dt>Average per period</dt><dd>500 TST</dd></div>
                    <div className="row"><dt>Cadence</dt><dd>fortnightly</dd></div>
                    <div className="row"><dt>Record current</dt><dd className="good">yes</dd></div>
                  </dl>
                </div>
              </div>
              <div className="card">
                <div className="card__head">
                  <h3>Credit granted</h3><span className="chip">Creditcoin CC3</span>
                </div>
                <div className="card__body">
                  <span className="lbl">Unsecured limit</span>
                  <div className="metric good">625<span className="u">TST</span></div>
                  <dl className="rows">
                    <div className="row"><dt>Collateral posted</dt><dd>none</dd></div>
                    <div className="row"><dt>Drawn</dt><dd>500 TST</dd></div>
                    <div className="row"><dt>Available</dt><dd>125 TST</dd></div>
                    <div className="row"><dt>Multiplier</dt><dd>1.25&times;</dd></div>
                  </dl>
                </div>
              </div>
            </div>
            <div className="scroll-x">
              <table>
                <tbody>
                  <tr><th>Contract</th><th>Chain</th><th>Address</th></tr>
                  <tr><td className="n">IncomeRegistry</td><td>Creditcoin CC3</td>
                    <td><a href={`${CC}/address/0x58Fde1CaF19e98690Bf301C349ddf4e0aBb6f875`}>0x58Fde1CaF19e98690Bf301C349ddf4e0aBb6f875</a></td></tr>
                  <tr><td className="n">CreditLine</td><td>Creditcoin CC3</td>
                    <td><a href={`${CC}/address/0x31f169EC7C69144aEbB04091925d66De1FD4bDdb`}>0x31f169EC7C69144aEbB04091925d66De1FD4bDdb</a></td></tr>
                  <tr><td className="n">Payer</td><td>Sepolia</td>
                    <td><a href={`${SEP}/address/0x4371bD116de786f44D0b0f144c7F5606757A088B`}>0x4371bD116de786f44D0b0f144c7F5606757A088B</a></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="risk">
          <div className="wrap">
            <h2>A node that stops earning has stopped working.</h2>
            <p className="lead">
              An unsecured line has no collateral to seize, so the risk model is cadence. For physical
              infrastructure that is not a proxy for default, it is a direct one: revenue stops when the
              hardware stops. <code>isCurrent()</code> freezes the line when the newest proven period ages
              past the stale window, which makes the credit line a liveness check on the device.
            </p>
            <div className="note">
              This is not theory. During development the registry accepted a real, fully proven
              six-period history and <code>CreditLine</code> still returned a limit of zero, because that
              revenue was six months stale. The freeze is the underwriting, and it fired before we tested
              it deliberately.
            </div>
          </div>
        </section>

        <section id="security">
          <div className="wrap">
            <h2>Built on a hardened base.</h2>
            <p className="lead">
              <code>AttestBase</code> is the base contract written for{' '}
              <a href="https://github.com/Nuel-osas/deadswitch">Deadswitch</a> after finding two flaws in
              the tutorial&rsquo;s <code>USCBase</code>, filed upstream as{' '}
              <a href="https://github.com/gluwa/USC-Builder-Examples/issues/37">gluwa/USC-Builder-Examples#37</a>.
              The action is derived from each log&rsquo;s own <code>topics[0]</code> rather than trusted
              from the caller, every log from the registered source is applied in order, foreign logs are
              skipped rather than reverted on, and <code>blockHeight</code> is threaded through so a stale
              proof cannot overwrite newer state.
            </p>
            <p className="lead">
              Two guards are specific to creating money rather than destroying it: only the registered
              revenue source can emit countable earnings, and each <code>(operator, period)</code> pair
              counts exactly once across all transactions. Without the first, anyone deploys a contract
              that emits <code>PaymentMade</code> for their own address and mints a revenue history.
              Without the second, one settlement replays into an unlimited limit.
            </p>
          </div>
        </section>

        <section id="scope">
          <div className="wrap">
            <h2>Scope</h2>
            <p className="lead">
              An MVP, stated plainly. One source chain, one revenue source, a single-lender pool. No
              interest, no term, no secondary market, no liquidation. What is submitted is the primitive:
              foreign revenue, proven trustlessly, priced into unsecured credit. The same registry works
              for any provable earnings stream &mdash; device revenue, payroll, or platform payouts.
            </p>
            <pre>{`yarn install && cp .env.example .env
yarn attest <sepolia_tx>    # prove a revenue settlement to Creditcoin
yarn status                 # read the operator's record and limit
yarn draw 100               # finance hardware, with nothing pledged`}</pre>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          Ledgerline &middot; testnet only, nothing here holds real value. &nbsp;
          <a href="https://github.com/Nuel-osas/ledgerline">GitHub</a> &middot;{' '}
          <a href={`${CC}/address/0x58Fde1CaF19e98690Bf301C349ddf4e0aBb6f875`}>IncomeRegistry</a> &middot;{' '}
          <a href="https://github.com/gluwa/USC-Builder-Examples/issues/37">Disclosure #37</a>
        </div>
      </footer>
    </>
  );
}
