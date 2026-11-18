import { createContext, useContext } from 'react';
import type { Project } from '../data/project';
import type { Router } from '../data/router';
import type { Page } from '../types';
import type { MenuEntry } from '../ui/Menu';

export type Theme = 'system' | 'light' | 'dark';

export interface LineageLink {
  focus?: string;
  up?: number;
  down?: number;
  trace?: 'up' | 'down' | 'both';
  column?: string;
  color?: string;
  columns?: boolean;
}

export interface AppApi {
  project: Project;
  router: Router;
  page: Page;
  theme: Theme;
  setTheme(theme: Theme): void;
  navigate(page: Page, options?: { hash?: string; replace?: boolean }): void;
  openMenu(at: { clientX: number; clientY: number }, entries: MenuEntry[], label?: string): void;
  closeMenu(): void;
  toast(message: string): void;
  copy(text: string, what?: string): void;
  openPalette(mode?: 'go' | 'add'): void;
  openSql(sql: string, run?: boolean): void;
  openLineage(link: LineageLink): void;
}

export const AppContext = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const api = useContext(AppContext);
  if (!api) throw new Error('useApp must be used inside <App>');
  return api;
}

export function lineageHash(link: LineageLink): string {
  const params = new URLSearchParams();
  if (link.focus) params.set('focus', link.focus);
  if (link.up !== undefined) params.set('up', String(link.up));
  if (link.down !== undefined) params.set('down', String(link.down));
  if (link.trace) params.set('trace', link.trace);
  if (link.column) params.set('col', link.column);
  if (link.color) params.set('color', link.color);
  if (link.columns) params.set('columns', '1');
  return params.toString();
}
