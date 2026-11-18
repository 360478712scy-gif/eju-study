import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import { App } from './App.tsx';
import { boot } from './lib/store.ts';

void boot();
createRoot(document.getElementById('root')!).render(<App />);
