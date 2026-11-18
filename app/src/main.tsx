import './lib/qaClock.ts';
import { lockdown } from './lib/lockdown.ts';
lockdown();
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppState, ContentBundle } from '@shared/types.ts';
import './styles/tokens.css';
import './styles/base.css';
import { t } from './copy/index.ts';
import { App, Startup } from './App.tsx';
import { fetchBank, fetchState } from './lib/api.ts';
import { useHash } from './lib/navigation.ts';
import { readAppearance } from './lib/preferences.ts';


function LiveApp({ hash }: { hash: string }) {
  const [loading, setLoading] = useState(0);
  const [data, setData] = useState<{ state: AppState; bundle: ContentBundle }>();
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([fetchState(), fetchBank()]).then(([state, bundle]) => {
      if (live) setData({ state, bundle });
    }).catch(() => {
      if (live) setError(true);
    });
    return () => { live = false; };
  }, [loading]);

  if (!data) return <Startup error={error} retry={() => { setError(false); setLoading(value => value + 1); }} />;
  return <App {...data} appearance={readAppearance()} hash={hash} />;
}

function Root() {
  const hash = useHash();
  return <LiveApp hash={hash} />;
}

document.title = t.nav.appTitle;
createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
