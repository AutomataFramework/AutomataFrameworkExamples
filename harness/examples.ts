// The small examples: `examples/<group>/<name>/main.ts`, one file each, plus a `public/` folder holding `automata.json`
// and any content files. The harness makes each one's `index.html` (it is not committed, so an example stays one file)
// and builds it into `examples/<group>-<name>/dist`, where CI looks for built games (`examples/*/dist`).
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const examples = join(import.meta.dirname, '..', 'examples')

export type Example = { id: string; source: string; built: string }

const page = (title: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body>
    <script type="module" src="/main.ts"></script>
  </body>
</html>
`

/** Every small example, as `<group>/<name>`, with the folder it is written in and the folder it is built into. */
export function smallExamples(root = examples): Example[] {
  const found: Example[] = []
  for (const group of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).toSorted((a, b) => a.name.localeCompare(b.name)))
    for (const name of readdirSync(join(root, group.name), { withFileTypes: true }).filter((d) => d.isDirectory()).toSorted((a, b) => a.name.localeCompare(b.name))) {
      const source = join(root, group.name, name.name)
      if (existsSync(join(source, 'main.ts')) && existsSync(join(source, 'public', 'automata.json')))
        found.push({ id: `${group.name}/${name.name}`, source, built: join(root, `${group.name}-${name.name}`) })
    }
  return found
}

/** Writes the example's `index.html`, which Vite needs to start from. */
export function writePage(example: Example): void {
  writeFileSync(join(example.source, 'index.html'), page(example.id.split('/')[1] ?? example.id))
}
