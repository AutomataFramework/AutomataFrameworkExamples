// Opens a page in real Chromium, draws a shader with WebGL2, fails unless a real NVIDIA GPU did it, and keeps the
// picture as a WebP. `AX_SMOKE_NO_VULKAN=1` drops the flags to show that the check fails on a software renderer.
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { envProblems, rendererProblem, VULKAN_ARGS } from './checks.ts'

const smi = spawnSync('nvidia-smi', ['-L'], { encoding: 'utf8' })
console.log(smi.stdout || smi.stderr)
if (smi.status !== 0) throw new Error('nvidia-smi failed: there is no NVIDIA GPU here')

const names = Object.keys(process.env).sort()
console.log(`Environment names (never values): ${names.join(' ')}`)
const bad = envProblems(names)
if (bad.length) throw new Error(`the environment holds names it must not: ${bad.join('; ')}`)
console.log('The environment holds only allowlisted names.')

// playwright-core is installed in the image, outside the change, so a change cannot swap it.
const { chromium } = createRequire('/usr/local/lib/node_modules/')('playwright-core')
const args = process.env.AX_SMOKE_NO_VULKAN === '1' ? ['--no-sandbox'] : VULKAN_ARGS
const browser = await chromium.launch({ args })
const page = await browser.newPage({ viewport: { width: 640, height: 360 } })
await page.setContent('<canvas id="c" width="640" height="360"></canvas><canvas id="o" width="640" height="360"></canvas>')
const result = await page.evaluate(() => {
  const c = document.getElementById('c') as HTMLCanvasElement
  const gl = c.getContext('webgl2')
  if (!gl) return { webgl2: false, renderer: null, webp: '' }
  const info = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    return s
  }
  const p = gl.createProgram()!
  gl.attachShader(p, shader(gl.VERTEX_SHADER, '#version 300 es\nin vec2 a;out vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0,1);}'))
  gl.attachShader(
    p,
    shader(
      gl.FRAGMENT_SHADER,
      '#version 300 es\nprecision highp float;in vec2 v;out vec4 o;void main(){vec2 q=v-.5;float r=length(q);o=vec4(.5+.5*cos(9.*r+vec3(0,2,4)),1);}',
    ),
  )
  gl.linkProgram(p)
  gl.useProgram(p)
  const b = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, b)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  // Copied to a 2D canvas in the same task, while the drawing is still there, then written as WebP.
  const o = document.getElementById('o') as HTMLCanvasElement
  o.getContext('2d')!.drawImage(c, 0, 0)
  return { webgl2: true, renderer, webp: o.toDataURL('image/webp', 0.9) }
})
await browser.close()
console.log(`Chromium ${process.env.AX_SMOKE_NO_VULKAN === '1' ? 'without' : 'with'} the Vulkan flags; WebGL2 renderer: ${result.renderer}`)
const problem = rendererProblem(result.webgl2, result.renderer)
if (problem) throw new Error(problem)
if (!result.webp.startsWith('data:image/webp;base64,')) throw new Error('the picture is not a WebP')
writeFileSync(process.env.AX_SMOKE_OUT ?? 'gpu-smoke.webp', Buffer.from(result.webp.split(',')[1], 'base64'))
console.log('Picture written.')
