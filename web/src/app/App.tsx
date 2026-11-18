import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../data/project';
import { Router, samePage } from '../data/router';
import { AnalyzePage, HealthPage, LineagePage, NotFoundPage } from '../pages/Other';
import { OverviewPage } from '../pages/Overview';
import { ResourcePage } from '../pages/Resource';
import type { Page } from '../types';
import { Icon, Logo } from '../ui/icons';
import { ContextMenu, type MenuEntry, type MenuRequest } from '../ui/Menu';
import { type AppApi, AppContext, type LineageLink, lineageHash, type Theme } from './context';
import { Palette } from './Palette';
import { Sidebar } from './Sidebar';

const THEME_KEY = 'lineum-theme';

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(theme: Theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage can be unavailable (private windows); the theme still applies for this page */
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

const NAV: { page: Page; label: string; icon: keyof typeof Icon }[] = [
  { page: { kind: 'overview' }, label: 'Overview', icon: 'overview' },
  { page: { kind: 'lineage' }, label: 'Lineage', icon: 'lineage' },
  { page: { kind: 'health' }, label: 'Health', icon: 'health' },
  { page: { kind: 'analyze' }, label: 'SQL', icon: 'sql' },
];

export function App({ project, root, initial }: { project: Project; root: string; initial: Page }) {
  const router = useMemo(() => new Router(project, root), [project, root]);
  const [page, setPage] = useState<Page>(initial);
  const [visit, setVisit] = useState(0);
  const [menu, setMenu] = useState<MenuRequest | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [palette, setPalette] = useState<'go' | 'add' | null>(null);
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const navigate = useCallback(
    (next: Page, options?: { hash?: string; replace?: boolean }) => {
      const href = router.href(next, options?.hash);
      setMenu(null);
      setPalette(null);
      setSidebarOpen(false);
      if (!router.spa) {
        window.location.href = href;
        return;
      }
      if (options?.replace) window.history.replaceState({}, '', href);
      else window.history.pushState({}, '', href);
      setPage(next);
      setVisit((v) => v + 1);
      window.scrollTo(0, 0);
    },
    [router],
  );

  useEffect(() => {
    const onPop = () => {
      setPage(router.current());
      setVisit((v) => v + 1);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [router]);

  useEffect(() => {
    const node = page.kind === 'resource' ? project.node(page.id) : undefined;
    const titles: Record<string, string> = { overview: 'dbt docs', lineage: 'Lineage explorer', health: 'Project health', analyze: 'Analyze with SQL', notfound: 'Not found' };
    document.title = node ? `${project.displayName(node)} · ${project.title}` : `${titles[page.kind]} · ${project.title}`;
  }, [page, project]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const api = useMemo<AppApi>(
    () => ({
      project,
      router,
      page,
      theme,
      setTheme: (next) => {
        applyTheme(next);
        setThemeState(next);
      },
      navigate,
      openMenu: (at, entries: MenuEntry[], label?: string) => setMenu({ x: at.clientX, y: at.clientY, entries, label }),
      closeMenu: () => setMenu(null),
      toast: showToast,
      copy: (text, what) => {
        void copyText(text).then((ok) => showToast(ok ? `Copied ${what ?? 'to the clipboard'}` : 'Copying is blocked in this browser'));
      },
      openPalette: (mode = 'go') => setPalette(mode),
      openSql: (sql, run = false) => navigate({ kind: 'analyze' }, { hash: `sql=${encodeURIComponent(sql)}${run ? '&run=1' : ''}` }),
      openLineage: (link: LineageLink) => navigate({ kind: 'lineage' }, { hash: lineageHash(link) }),
    }),
    [project, router, page, theme, navigate, showToast],
  );

  // Global shortcuts: ⌘K or / opens search.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPalette(page.kind === 'lineage' ? 'add' : 'go');
      } else if (event.key === '/' && !typing) {
        event.preventDefault();
        setPalette('go');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page.kind]);

  const fullBleed = page.kind === 'lineage' || page.kind === 'analyze';
  const node = page.kind === 'resource' ? project.node(page.id) : undefined;
  const pageKey = `${page.kind}:${page.kind === 'resource' ? page.id : ''}:${visit}`;
  const nextTheme: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
  const ThemeIcon = theme === 'light' ? Icon.sun : theme === 'dark' ? Icon.moon : Icon.system;

  return (
    <AppContext.Provider value={api}>
      <div className={`app${fullBleed ? ' is-full' : ''}${sidebarOpen ? ' sidebar-open' : ''}`}>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="topbar">
          <button type="button" className="icon-button topbar-menu" aria-label="Show navigation" onClick={() => setSidebarOpen((v) => !v)}>
            <Icon.menu size={16} />
          </button>
          <a
            className="brand"
            href={router.href({ kind: 'overview' })}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey) return;
              event.preventDefault();
              navigate({ kind: 'overview' });
            }}
          >
            <Logo size={22} />
            <span className="brand-title">{project.title}</span>
          </a>
          <button type="button" className="search-trigger" onClick={() => setPalette(page.kind === 'lineage' ? 'add' : 'go')}>
            <Icon.search size={14} />
            <span>Search models, columns, sources</span>
            <kbd className="kbd">⌘K</kbd>
          </button>
          <nav className="topnav" aria-label="Main">
            {NAV.map((item) => {
              const ItemIcon = Icon[item.icon];
              const current = samePage(item.page, page);
              return (
                <a
                  key={item.label}
                  href={router.href(item.page)}
                  aria-current={current ? 'page' : undefined}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                    event.preventDefault();
                    navigate(item.page);
                  }}
                >
                  <ItemIcon size={15} />
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>
          <button
            type="button"
            className="icon-button"
            onClick={() => api.setTheme(nextTheme[theme])}
            title={`Theme: ${theme}. Switch to ${nextTheme[theme]}.`}
            aria-label={`Theme: ${theme}. Switch to ${nextTheme[theme]}.`}
          >
            <ThemeIcon size={16} />
          </button>
        </header>
        <Sidebar current={node?.id} />
        <main id="main" className="main" key={pageKey}>
          {page.kind === 'overview' && <OverviewPage />}
          {page.kind === 'resource' && (node ? <ResourcePage node={node} /> : <NotFoundPage />)}
          {page.kind === 'lineage' && <LineagePage />}
          {page.kind === 'health' && <HealthPage />}
          {page.kind === 'analyze' && <AnalyzePage />}
          {page.kind === 'notfound' && <NotFoundPage />}
        </main>
        {sidebarOpen && <div className="scrim" onClick={() => setSidebarOpen(false)} role="presentation" />}
      </div>
      <ContextMenu request={menu} onClose={() => setMenu(null)} />
      {palette && <Palette mode={palette} onClose={() => setPalette(null)} />}
      <div className={`toast${toast ? ' is-on' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </AppContext.Provider>
  );
}
