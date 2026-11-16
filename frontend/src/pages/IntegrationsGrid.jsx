// src/pages/IntegrationsGrid.jsx — part 3a: provider card grid
import { CheckCircle2, Unplug } from 'lucide-react';
import { maskAccountId } from './IntegrationsData';

export default function IntegrationsGrid({ accounts, onSelect }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {accounts.cards.map((card) => {
        const account = accounts.linked.find((a) => a.provider === card.id);
        const connected = !!account;
        return (
          <article key={card.id} className="glass-card p-5">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-black text-white ${card.gradient}`}>
              {card.icon}
            </div>
            <h2 className="mt-3 font-semibold text-slate-900 dark:text-white">{card.name}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{card.blurb}</p>
            <div className="mt-3">
              {connected ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Connected as {account.providerEmail || maskAccountId(account.providerAccountId)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-500/10 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:border-white/10 dark:text-slate-300">
                  <Unplug className="h-3.5 w-3.5" /> Not connected
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onSelect({ card, account, mode: connected ? 'disconnect' : 'connect' })}
              className={connected
                ? 'btn-ghost mt-4 border border-red-500/30 !text-red-500 hover:!bg-red-500/10 dark:!text-red-300'
                : 'btn-brand mt-4 w-full'}
            >
              {connected ? 'Disconnect' : 'Connect'}
            </button>
          </article>
        );
      })}
    </section>
  );
}
