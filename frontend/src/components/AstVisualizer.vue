<template>
  <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-bold text-slate-400">语法树可视分析</h3>
      <div class="flex gap-2">
        <button @click="store.expandAllAstNodes" class="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300">全部展开</button>
        <button @click="store.collapseAllAstNodes" class="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300">全部折叠</button>
      </div>
    </div>

    <div v-if="store.pattern" class="mb-4 bg-slate-900 rounded-lg p-3 font-mono text-sm overflow-x-auto">
      <span class="text-slate-500">/</span>
      <span v-for="(segment, idx) in patternSegments" :key="idx"
        @mouseenter="onPatternSegmentHover(segment.nodeId)"
        @mouseleave="onPatternSegmentLeave"
        @click="onPatternSegmentClick(segment.nodeId)"
        class="cursor-pointer transition-all duration-150 rounded px-0.5"
        :class="getPatternSegmentClass(segment.nodeId)"
        :title="getPatternSegmentTitle(segment.nodeId)">
        {{ segment.text }}
      </span>
      <span class="text-slate-500">/g</span>
    </div>

    <div class="flex gap-4">
      <div class="flex-1 overflow-auto max-h-80 bg-slate-900 rounded-lg p-3 border border-slate-700">
        <div v-if="store.ast" class="font-mono text-sm">
          <AstTreeNode :node="store.ast" :level="0" />
        </div>
        <div v-else class="text-slate-500 text-sm text-center py-8">
          {{ store.error ? '解析错误' : '等待解析...' }}
        </div>
      </div>

      <div class="w-72 bg-slate-900 rounded-lg p-3 border border-slate-700">
        <h4 class="text-xs font-bold text-slate-500 mb-2">节点详情</h4>
        <div v-if="displayedNode" class="space-y-3">
          <div class="flex items-center gap-2">
            <span class="inline-block w-3 h-3 rounded" :style="{ backgroundColor: nodeInfo.color }"></span>
            <span class="font-bold text-slate-200">{{ nodeInfo.typeLabel }}</span>
          </div>
          <div class="text-xs text-slate-400">
            <div class="mb-1"><span class="text-slate-500">位置:</span> [{{ displayedNode.start }}, {{ displayedNode.end }})</div>
            <div class="mb-1"><span class="text-slate-500">匹配片段:</span> <code class="bg-slate-800 px-1 rounded text-cyan-400">{{ nodePatternText }}</code></div>
            <div v-if="displayedNode.groupIndex" class="mb-1">
              <span class="text-slate-500">分组索引:</span> <span class="text-pink-400">Group {{ displayedNode.groupIndex }}</span>
            </div>
          </div>
          <div class="border-t border-slate-700 pt-3">
            <div class="text-xs text-slate-500 mb-1">说明</div>
            <div class="text-sm text-slate-300">{{ displayedNode.description }}</div>
          </div>
          <div class="border-t border-slate-700 pt-3">
            <div class="text-xs text-slate-500 mb-1">示例</div>
            <div class="text-sm text-emerald-400 font-mono">{{ displayedNode.example }}</div>
          </div>
          <div v-if="displayedNode.children && displayedNode.children.length > 0" class="border-t border-slate-700 pt-3">
            <div class="text-xs text-slate-500 mb-1">子节点 ({{ displayedNode.children.length }})</div>
            <div class="space-y-1">
              <div v-for="(child, i) in displayedNode.children" :key="i"
                class="text-xs px-2 py-1 bg-slate-800 rounded flex items-center gap-2 cursor-pointer hover:bg-slate-700 transition-colors"
                @click="store.selectAstNode(child.id)">
                <span class="inline-block w-2 h-2 rounded" :style="{ backgroundColor: store.getNodeInfo(child.type).color }"></span>
                <span class="text-slate-400">{{ store.getNodeInfo(child.type).typeLabel }}</span>
                <span v-if="child.value" class="text-cyan-400 ml-auto">"{{ child.value }}"</span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="text-slate-500 text-sm text-center py-8">
          悬停或点击节点查看详情
        </div>
      </div>
    </div>

    <div v-if="store.activeAstHighlight && store.nfa" class="mt-3 text-xs text-slate-500">
      <span class="text-cyan-400">💡</span> NFA 状态机中已高亮显示与该节点相关的状态路径
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, PropType } from 'vue'
import { useRegexStore } from '../store/regex'
import type { ASTNode } from '../types'

const store = useRegexStore()

const displayedNode = computed(() => {
  return store.selectedAstNode || store.hoveredAstNode
})

const nodeInfo = computed(() => {
  if (!displayedNode.value) return { typeLabel: '', description: '', example: '', color: '#64748b' }
  return store.getNodeInfo(displayedNode.value.type)
})

const nodePatternText = computed(() => {
  if (!displayedNode.value) return ''
  return store.pattern.substring(displayedNode.value.start, displayedNode.value.end)
})

const patternSegments = computed(() => {
  const segments: { text: string; nodeId: string }[] = []
  const highlights = store.highlightedPatternSegments
  if (highlights.length === 0) return segments

  const sorted = [...highlights].sort((a, b) => a.start - b.start || b.end - a.end)

  const leafNodes: typeof highlights = []
  for (const h of sorted) {
    const isCovered = leafNodes.some(l => l.start <= h.start && l.end >= h.end)
    if (!isCovered) {
      const children = sorted.filter(c => c.start >= h.start && c.end <= h.end && c.nodeId !== h.nodeId)
      if (children.length === 0) {
        leafNodes.push(h)
      }
    }
  }

  leafNodes.sort((a, b) => a.start - b.start)

  for (const h of leafNodes) {
    segments.push({
      text: store.pattern.substring(h.start, h.end),
      nodeId: h.nodeId
    })
  }

  return segments
})

function getPatternSegmentClass(nodeId: string): string {
  if (store.selectedAstNodeId === nodeId) {
    return 'bg-cyan-600 text-white font-bold'
  }
  if (store.hoveredAstNodeId === nodeId) {
    return 'bg-yellow-600 text-white font-bold'
  }
  return 'hover:bg-slate-700 text-cyan-400'
}

function getPatternSegmentTitle(nodeId: string): string {
  if (!store.ast) return ''
  const node = findNodeByIdInternal(store.ast, nodeId)
  if (!node) return ''
  return `${store.getNodeInfo(node.type).typeLabel}: ${node.description}`
}

function findNodeByIdInternal(node: ASTNode, id: string): ASTNode | null {
  if (node.id === id) return node
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeByIdInternal(child, id)
      if (found) return found
    }
  }
  return null
}

function onPatternSegmentHover(nodeId: string) {
  store.hoverAstNode(nodeId)
}

function onPatternSegmentLeave() {
  store.hoverAstNode(null)
}

function onPatternSegmentClick(nodeId: string) {
  store.selectAstNode(store.selectedAstNodeId === nodeId ? null : nodeId)
}

const AstTreeNode = defineComponent({
  name: 'AstTreeNode',
  props: {
    node: { type: Object as PropType<ASTNode>, required: true },
    level: { type: Number, required: true }
  },
  setup(props) {
    const store = useRegexStore()

    const info = computed(() => store.getNodeInfo(props.node.type))
    const isExpanded = computed(() => store.isAstNodeExpanded(props.node.id))
    const isSelected = computed(() => store.selectedAstNodeId === props.node.id)
    const isHovered = computed(() => store.hoveredAstNodeId === props.node.id)
    const hasChildren = computed(() => props.node.children && props.node.children.length > 0)

    const nodeText = computed(() => {
      const base = info.value.typeLabel
      if (props.node.value) return `${base}: "${props.node.value}"`
      if (props.node.groupIndex !== undefined) return `${base} ${props.node.groupIndex}`
      return base
    })

    function onToggle() {
      if (hasChildren.value) {
        store.toggleAstNodeExpanded(props.node.id)
      }
    }

    function onNodeClick(e: MouseEvent) {
      e.stopPropagation()
      store.selectAstNode(isSelected.value ? null : props.node.id)
    }

    function onMouseEnter() {
      store.hoverAstNode(props.node.id)
    }

    function onMouseLeave() {
      store.hoverAstNode(null)
    }

    return () => {
      const indent = props.level * 20

      return h('div', {
        class: 'select-none',
        onClick: onToggle,
        onMouseenter: onMouseEnter,
        onMouseleave: onMouseLeave
      }, [
        h('div', {
          class: [
            'flex items-center py-1 px-2 rounded cursor-pointer transition-all duration-150 -mx-2',
            isSelected.value ? 'bg-cyan-900/50 border-l-2 border-cyan-400' :
            isHovered.value ? 'bg-slate-700/50 border-l-2 border-yellow-400' :
            'border-l-2 border-transparent hover:bg-slate-700/30'
          ],
          style: { paddingLeft: `${indent + 8}px` },
          onClick: onNodeClick
        }, [
          hasChildren.value ? h('span', {
            class: 'mr-2 text-slate-500 hover:text-slate-300 transition-colors w-4 text-center font-bold'
          }, isExpanded.value ? '▼' : '▶') : h('span', { class: 'mr-2 w-4' }),

          h('span', {
            class: 'inline-block w-3 h-3 rounded mr-2 flex-shrink-0',
            style: { backgroundColor: info.value.color }
          }),

          h('span', {
            class: [
              'text-sm',
              isSelected.value ? 'text-cyan-300 font-bold' :
              isHovered.value ? 'text-yellow-300 font-medium' : 'text-slate-300'
            ]
          }, nodeText.value),

          h('span', {
            class: 'ml-2 text-xs text-slate-500 font-mono'
          }, `[${props.node.start}:${props.node.end}]`)
        ]),

        hasChildren.value && isExpanded.value
          ? h('div', {}, props.node.children!.map((child: ASTNode, i: number) =>
              h(AstTreeNode, { key: child.id || i, node: child, level: props.level + 1 })
            ))
          : null
      ])
    }
  }
})
</script>
