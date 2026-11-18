import '@xyflow/react/dist/base.css';
import './styles/tokens.css';
import './styles/app.css';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { Project } from './data/project';
import type { Page } from './types';

function boot() {
  const root = document.getElementById('lineum-root');
  if (!root) return;
  const payload = window.__LINEUM__;
  if (!payload || !Array.isArray(payload.nodes)) {
    root.insertAdjacentHTML(
      'afterbegin',
      '<p class="boot-error">The interactive app could not load its data (assets/data.js). The page content below still works.</p>',
    );
    return;
  }
  let initial: Page = { kind: 'overview' };
  try {
    initial = JSON.parse(root.dataset.page ?? '{"kind":"overview"}') as Page;
  } catch {
    /* fall back to the overview */
  }
  const project = new Project(payload);
  if (initial.kind === 'resource' && !project.node(initial.id)) initial = { kind: 'notfound' };
  root.classList.add('is-app');
  createRoot(root).render(<App project={project} root={root.dataset.root ?? ''} initial={initial} />);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
