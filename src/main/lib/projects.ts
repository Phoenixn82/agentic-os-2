import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Project, ProjectService } from '../../shared/types'
import { PROJECTS_DIR } from './paths'

type CatalogEntry = Omit<Project, 'existsOnDisk' | 'status'>

const CATALOG: CatalogEntry[] = [
  {
    slug: 'portfolio-site',
    name: 'Portfolio Site',
    dir: 'portfolio-site',
    type: 'next',
    port: 3010,
    devCommand: 'npm run dev -- -p 3010',
    tags: ['nextjs', 'react'],
    description: 'Example personal site pinned to a stable local port.'
  },
  {
    slug: 'client-site',
    name: 'Client Site',
    dir: 'client-site',
    type: 'astro',
    port: 3020,
    devCommand: 'npm run dev -- --port 3020',
    tags: ['astro'],
    description: 'Example marketing site with its own fixed dev-server port.'
  },
  {
    slug: 'research-tool',
    name: 'Research Tool',
    dir: 'research-tool',
    type: 'vite',
    port: 3030,
    devCommand: 'npm run dev -- --port 3030',
    tags: ['vite', 'typescript'],
    description: 'Example local utility app.'
  },
  {
    slug: 'full-stack-app',
    name: 'Full Stack App',
    dir: 'full-stack-app',
    type: 'multi',
    port: null,
    devCommand: '',
    tags: ['frontend', 'api'],
    description: 'Example monorepo with a frontend and API service.',
    services: [
      { id: 'web', label: 'web', type: 'vite', port: 3040, devCommand: 'npm run dev -- --port 3040' },
      { id: 'api', label: 'api', type: 'node', port: 8040, devCommand: 'npm run api -- --port 8040' }
    ]
  }
]

export function getProjects(): Project[] {
  return CATALOG.map((entry) => {
    const existsOnDisk = existsSync(join(PROJECTS_DIR, entry.dir))
    const status: Project['status'] = existsOnDisk ? 'active' : 'missing'

    return {
      ...entry,
      services: entry.services ? entry.services.map((s): ProjectService => ({ ...s })) : undefined,
      existsOnDisk,
      status
    }
  })
}
