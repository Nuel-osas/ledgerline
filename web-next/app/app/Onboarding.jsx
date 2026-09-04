'use client';

/**
 * Guided first run.
 *
 * A visitor arrives knowing nothing and needs to reach the interesting moment
 * fast: they personally prove an operator's revenue and watch unsecured credit
 * appear. Each step exposes exactly one action, unlocks only when the previous
 * one is genuinely satisfied on-chain, and marks itself done from real state
 * rather than from a click.
 */
export default function Onboarding({
  connected, hasGas, provenThisSession, limit, isOperator,
  onGas, onProve, onDraw, busy, unprovenCount,
}) {
  const steps = [
    {
      id: 1,
      title: 'Connect a wallet',
      body: 'Any wallet. You are not the borrower here: you are about to act as the keeper, which anyone can do.',
      done: connected,
      action: null,
      hint: connected ? null : 'Use the Connect Wallet button above.',
    },
    {
      id: 2,
      title: 'Take some gas',
      body: 'A relayer pushes 0.5 CTC to you. You sign nothing, because needing gas to ask for gas would defeat the point.',
      done: connected && hasGas,
      action: connected && !hasGas ? { label: busy === 'gas' ? 'Sending…' : 'Send me gas', fn: onGas } : null,
    },
    {
      id: 3,
      title: 'Prove the operator’s revenue',
      body: `Pick any unproven settlement and submit its Attestcoin proof yourself. ${unprovenCount} are waiting. The 0x0FD2 precompile verifies it inside your transaction.`,
      done: provenThisSession,
      action: connected && hasGas && !provenThisSession
        ? { label: 'Prove one for me', fn: onProve } : null,
    },
    {
      id: 4,
      title: 'Watch credit appear',
      body: limit && limit > 0n
        ? 'The limit below is derived from revenue you just helped prove. No collateral was posted, at any point.'
        : 'Once enough periods are proven, an unsecured limit appears, priced from run-rate and how many networks pay this operator.',
      done: Boolean(limit && limit > 0n),
      action: null,
    },
    {
      id: 5,
      title: 'Draw against it',
      body: isOperator
        ? 'You are connected as the operator, so you can borrow against the line right now.'
        : 'Borrowing is scoped to whoever earned the revenue. Import the demo operator key at the bottom of this page to try it.',
      done: false,
      action: isOperator ? { label: busy === 'draw' ? 'Drawing…' : 'Draw 50', fn: onDraw } : null,
    },
  ];

  const current = steps.find((s) => !s.done) ?? steps[steps.length - 1];

  return (
    <section className="onboard" aria-label="Getting started">
      <div className="onboard__head">
        <h2>Try it yourself</h2>
        <span className="onboard__count">
          {steps.filter((s) => s.done).length} / {steps.length}
        </span>
      </div>
      <ol className="onboard__steps">
        {steps.map((s) => {
          const state = s.done ? 'done' : s.id === current.id ? 'now' : 'wait';
          return (
            <li key={s.id} className={`ostep ostep--${state}`}>
              <span className="ostep__n" aria-hidden="true">{s.done ? '✓' : s.id}</span>
              <div className="ostep__body">
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                {s.hint && state === 'now' && <p className="ostep__hint">{s.hint}</p>}
                {s.action && state === 'now' && (
                  <button className="btn btn--accent ostep__btn" onClick={s.action.fn} disabled={Boolean(busy)}>
                    {s.action.label}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
