import type { Page } from '../types';
import type { Project } from './project';

/**
 * Every page of a Lineum site is a real HTML file, so links work everywhere: on any static host,
 * with clean URLs (Vercel strips .html) and from disk. Over http(s) the app navigates with the
 * History API; from file:// it lets the browser load the next prerendered page.
 */
export class Router {
  readonly root: string; // relative prefix from the current page to the site root, e.g. "../../"
  readonly baseHref: string; // absolute URL of the site root
  readonly spa: boolean;

  constructor(
    private readonly project: Project,
    root: string,
  ) {
    this.root = root;
    this.baseHref = new URL(root || './', window.location.href).href;
    this.spa = window.location.protocol === 'http:' || window.location.protocol === 'https:';
  }

  urlOf(page: Page): string {
    switch (page.kind) {
      case 'overview':
        return 'index.html';
      case 'lineage':
        return 'lineage.html';
      case 'health':
        return 'health.html';
      case 'analyze':
        return 'analyze.html';
      case 'resource':
        return this.project.node(page.id)?.url ?? 'index.html';
      default:
        return '404.html';
    }
  }

  /** Absolute href for a page (plus an optional hash), valid from any page of the site. */
  href(page: Page, hash = ''): string {
    const url = new URL(this.urlOf(page), this.baseHref);
    if (hash) url.hash = hash;
    return url.href;
  }

  /** Resolve the current location to a page. */
  current(): Page {
    const base = new URL(this.baseHref);
    let path = decodeURIComponent(window.location.pathname);
    if (path.startsWith(base.pathname)) path = path.slice(base.pathname.length);
    path = path.replace(/^\/+/, '');
    if (path === '' || path === 'index.html' || path === 'index') return { kind: 'overview' };
    const bare = path.replace(/\.html$/, '').replace(/\/$/, '');
    if (bare === 'lineage') return { kind: 'lineage' };
    if (bare === 'health') return { kind: 'health' };
    if (bare === 'analyze') return { kind: 'analyze' };
    const node = this.project.nodes.find((n) => n.url === `${bare}.html`);
    return node ? { kind: 'resource', id: node.id } : { kind: 'notfound' };
  }
}

export function samePage(a: Page, b: Page): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'resource' || (b.kind === 'resource' && a.id === b.id);
}

export function readHash(): URLSearchParams {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''));
}

export function writeHash(params: URLSearchParams) {
  const value = params.toString();
  const url = new URL(window.location.href);
  url.hash = value;
  window.history.replaceState(window.history.state, '', url.href);
}
