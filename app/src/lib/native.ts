// Bridge to the macOS shell (desktop/Chengxue.swift) with browser fallbacks.
declare global {
  interface Window {
    ejuNative?: {
      saveText(name: string, text: string): Promise<{ saved?: boolean; cancelled?: boolean; filename?: string }>;
      writeClipboard(text: string): Promise<boolean>;
      readClipboard(): Promise<string>;
    };
  }
}

export const isNative = () => !!window.ejuNative;

export async function saveTextFile(name: string, text: string, type = 'application/json'): Promise<boolean> {
  if (window.ejuNative) {
    const r = await window.ejuNative.saveText(name, text);
    return !!r.saved;
  }
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (window.ejuNative) return await window.ejuNative.writeClipboard(text);
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export type ShellCommand = { action: 'navigate' | 'toggle-music' | 'toggle-focus' | 'shortcuts'; page?: string };

/** Menu/shortcut commands from the shell (also synthesized from keydown in the browser). */
export function onShellCommand(fn: (c: ShellCommand) => void) {
  const h = (e: Event) => fn((e as CustomEvent<ShellCommand>).detail);
  window.addEventListener('eju-command', h);
  return () => window.removeEventListener('eju-command', h);
}

export function onWindowVisibility(fn: (visible: boolean) => void) {
  const hide = () => fn(false);
  const show = () => fn(true);
  window.addEventListener('eju-window-hidden', hide);
  window.addEventListener('eju-window-visible', show);
  const vis = () => fn(document.visibilityState === 'visible');
  document.addEventListener('visibilitychange', vis);
  return () => {
    window.removeEventListener('eju-window-hidden', hide);
    window.removeEventListener('eju-window-visible', show);
    document.removeEventListener('visibilitychange', vis);
  };
}

/** Shell menu page ids → app routes. */
export const SHELL_PAGES: Record<string, string> = {
  today: 'today',
  learning: 'practice',
  notebook: 'review',
  report: 'insights',
};
