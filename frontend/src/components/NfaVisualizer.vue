<template>
  <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-bold text-slate-400">NFA 状态机可视化</h3>
      <span v-if="store.nfa" class="text-xs text-slate-500">{{ store.nfa.states.length }} 状态 · {{ store.nfa.transitions.length }} 转移</span>
    </div>
    <canvas ref="canvasRef" width="800" height="500" class="w-full bg-slate-900 rounded-lg border border-slate-700"></canvas>
    <div class="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
      <span><span class="inline-block w-3 h-3 rounded-full bg-cyan-500 mr-1"></span>起始状态</span>
      <span><span class="inline-block w-3 h-3 rounded-full bg-green-500 mr-1"></span>接受状态</span>
      <span><span class="inline-block w-3 h-3 rounded-full bg-orange-500 mr-1"></span>当前激活</span>
      <span><span class="inline-block w-3 h-3 rounded-full bg-violet-500 mr-1"></span>语法树关联</span>
      <span><span class="inline-block w-3 h-3 rounded-full bg-slate-600 mr-1"></span>普通状态</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRegexStore } from '../store/regex'

const store = useRegexStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)

function getAstRelatedStates(): { states: Set<number>; transitions: Set<string> } {
  const relatedStates = new Set<number>()
  const relatedTransitions = new Set<string>()

  if (!store.activeAstHighlight || !store.nfa) {
    return { states: relatedStates, transitions: relatedTransitions }
  }

  const node = store.activeAstHighlight
  const nodePattern = store.pattern.substring(node.start, node.end)

  const transitionMap: Record<string, string> = {
    '__dot': 'dot',
    '__digit': 'digit',
    '__word': 'word',
    '__space': 'space'
  }

  if (node.type === 'char' && node.value) {
    relatedTransitions.add(node.value)
  } else if (node.type === 'dot') {
    relatedTransitions.add('dot')
  } else if (node.type === 'digit') {
    relatedTransitions.add('digit')
  } else if (node.type === 'word') {
    relatedTransitions.add('word')
  } else if (node.type === 'space') {
    relatedTransitions.add('space')
  } else if (node.type === 'charclass') {
    relatedTransitions.add(`class_`)
  } else if (node.type === 'anchor') {
    // 锚点不产生实际转移
  } else {
    // 对于组合节点（concat, or, star, plus, question, group），
    // 通过其子节点来收集相关转移
    collectChildTransitions(node, relatedTransitions)
  }

  // 查找相关的状态
  store.nfa.transitions.forEach(t => {
    const sym = t.symbol
    if (sym === null) return
    const symStr = String(sym)
    const isMatch = Array.from(relatedTransitions).some(rt =>
      symStr === rt || symStr.startsWith(`__${rt}`) || symStr.startsWith(rt)
    )
    if (isMatch) {
      relatedStates.add(t.from)
      relatedStates.add(t.to)
    }
  })

  // 如果是量词或组合节点，包含更多状态
  if (['star', 'plus', 'question', 'concat', 'or', 'group'].includes(node.type)) {
    store.nfa!.states.forEach(s => relatedStates.add(s.id))
  }

  return { states: relatedStates, transitions: relatedTransitions }
}

function collectChildTransitions(node: any, transitions: Set<string>) {
  if (!node.children) return
  for (const child of node.children) {
    if (child.type === 'char' && child.value) {
      transitions.add(child.value)
    } else if (child.type === 'dot') {
      transitions.add('dot')
    } else if (child.type === 'digit') {
      transitions.add('digit')
    } else if (child.type === 'word') {
      transitions.add('word')
    } else if (child.type === 'space') {
      transitions.add('space')
    } else if (child.type === 'charclass') {
      transitions.add('class_')
    } else if (child.children) {
      collectChildTransitions(child, transitions)
    }
  }
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas || !store.nfa) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const activeStates = new Set<number>()
  if (store.matchResult && store.currentStep < store.matchResult.steps.length) {
    const step = store.matchResult.steps[store.currentStep]
    if (step) { activeStates.add(step.currentState); activeStates.add(step.nextState) }
  }

  const astRelated = getAstRelatedStates()
  const hasAstHighlight = astRelated.states.size > 0 || astRelated.transitions.size > 0

  // Draw transitions
  store.nfa.transitions.forEach(t => {
    const from = store.nfa!.states.find(s => s.id === t.from)
    const to = store.nfa!.states.find(s => s.id === t.to)
    if (!from || !to) return

    const isActive = activeStates.has(t.from) && activeStates.has(t.to)
    const isAstRelated = hasAstHighlight && (
      astRelated.states.has(t.from) ||
      astRelated.states.has(t.to) ||
      (t.symbol !== null && Array.from(astRelated.transitions).some(rt => {
        const symStr = String(t.symbol)
        return symStr === rt || symStr.startsWith(`__${rt}`) || symStr.startsWith(rt)
      }))
    )

    let strokeColor = '#475569'
    let lineWidth = 1
    let fillColor = '#475569'
    let textColor = '#94a3b8'

    if (isActive) {
      strokeColor = '#f97316'
      fillColor = '#f97316'
      textColor = '#fbbf24'
      lineWidth = 2.5
    } else if (isAstRelated) {
      strokeColor = '#a855f7'
      fillColor = '#a855f7'
      textColor = '#c084fc'
      lineWidth = 2
    } else if (hasAstHighlight) {
      strokeColor = '#334155'
      fillColor = '#334155'
      textColor = '#475569'
    }

    ctx.strokeStyle = strokeColor
    ctx.lineWidth = lineWidth
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)

    if (t.from === t.to) {
      // Self loop
      const mx = from.x, my = from.y - 35
      ctx.quadraticCurveTo(mx + 25, my, from.x + 10, from.y - 15)
    } else {
      const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2
      const dx = to.x - from.x, dy = to.y - from.y
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      const offX = -dy / len * 20, offY = dx / len * 20
      ctx.quadraticCurveTo(mx + offX, my + offY, to.x, to.y)
    }
    ctx.stroke()

    // Arrowhead
    const angle = Math.atan2(to.y - from.y, to.x - from.x)
    const ex = to.x - Math.cos(angle) * 22, ey = to.y - Math.sin(angle) * 22
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex - Math.cos(angle - 0.4) * 8, ey - Math.sin(angle - 0.4) * 8)
    ctx.lineTo(ex - Math.cos(angle + 0.4) * 8, ey - Math.sin(angle + 0.4) * 8)
    ctx.closePath()
    ctx.fillStyle = fillColor
    ctx.fill()

    // Label
    const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2
    const dx2 = to.x - from.x, dy2 = to.y - from.y
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1
    const lx = mx - dy2 / len2 * 15, ly = my + dx2 / len2 * 15
    ctx.fillStyle = textColor
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(t.label, lx, ly)
  })

  // Draw states
  store.nfa.states.forEach(s => {
    const isActive = activeStates.has(s.id)
    const isAstRelated = hasAstHighlight && astRelated.states.has(s.id)

    let color = '#475569'
    let strokeColor = '#1e293b'
    let opacity = 1

    if (s.isStart) {
      color = '#06b6d4'
    } else if (s.isAccept) {
      color = '#22c55e'
    } else if (isActive) {
      color = '#f97316'
    } else if (isAstRelated) {
      color = '#7c3aed'
    } else if (hasAstHighlight) {
      opacity = 0.4
      color = '#334155'
    }

    if (isActive) {
      strokeColor = '#fbbf24'
    } else if (isAstRelated) {
      strokeColor = '#a855f7'
    }

    ctx.globalAlpha = opacity
    ctx.beginPath()
    ctx.arc(s.x, s.y, 20, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = isActive || isAstRelated ? 2.5 : 2
    ctx.stroke()
    ctx.globalAlpha = 1

    if (s.isAccept) {
      ctx.beginPath()
      ctx.arc(s.x, s.y, 15, 0, Math.PI * 2)
      ctx.strokeStyle = '#16a34a'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    ctx.fillStyle = '#f1f5f9'
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(s.id), s.x, s.y)

    if (s.isStart) {
      ctx.beginPath()
      ctx.moveTo(s.x - 40, s.y)
      ctx.lineTo(s.x - 22, s.y)
      ctx.strokeStyle = '#06b6d4'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(s.x - 22, s.y)
      ctx.lineTo(s.x - 28, s.y - 4)
      ctx.lineTo(s.x - 28, s.y + 4)
      ctx.closePath()
      ctx.fillStyle = '#06b6d4'
      ctx.fill()
    }
  })
}

onMounted(() => { draw() })
watch(() => [store.nfa, store.currentStep, store.activeAstHighlight], () => draw(), { deep: true })
</script>
