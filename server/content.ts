import fs from 'node:fs';
import { indexBank, type BankIndex } from '../shared/bank.ts';

// The content builder atomically publishes a new bundle while the server is running.
export function bankReader(file: string) {
  let cached: BankIndex;
  let stamp = '';
  return () => {
    const st = fs.statSync(file);
    const key = [st.ino, st.size, st.mtimeMs].join(':');
    if (key !== stamp) {
      cached = indexBank(JSON.parse(fs.readFileSync(file, 'utf8')));
      stamp = key;
    }
    return cached;
  };
}
