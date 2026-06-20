<template>
  <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-bold text-slate-400">语法树可视分析</h3>
      <div class="flex gap-2">
        <button @click="store.expandAllAstNodes" class="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300">全部展开</button>
        <button @click="store.collapseAllAstNodes" class="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-slate-300">全部折叠</button>
      </div>
    </div>

    <div v-if="store.pattern" class="mb-4 bg-slate-900 rounded-lg p-3 font-mono text-sm overflow-x-auto select-none">
      <span class="text-slate-500 select-none">/</span>
      <span class="relative whitespace-pre">
        <span v-for="(char, idx) in patternChars" :key="idx"
          class="inline-block transition-all duration-150 cursor-pointer rounded-sm"
          :class="getCharClass(idx)"
          :style="getCharStyle(idx)"
          @click.stop="onCharClick(idx)"
          @mouseenter="onCharHover(idx)"
          @mouseleave="onCharLeave">
          {{ char === ' ' ? '\u00A0' : char }}
        </span>
      </span>
      <span class="text-slate-500 select-none">/g</span>
    </div>

    <div v-if="hoveredCharIndex !== null && store.ast" class="mb-2 text-xs text-slate-500">
      <span class="text-cyan-400">索引 {{ hoveredCharIndex }}</span>
      <span class="mx-2">·</span>
      <span>{{ hoveredNodeInfo }}</span>
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
            <div class="mb-1"><span class="text-slate-500">位置范围:</span> [{{ displayedNode.start }}, {{ displayedNode.end }}) 共 {{ displayedNode.end - displayedNode.start }} 字符</div>
            <div class="mb-1"><span class="text-slate-500">原始片段:</span> <code class="bg-slate-800 px-1.5 py-0.5 rounded text-cyan-400">{{ nodePatternText }}</code></div>
            <div v-if="displayedNode.groupIndex !== undefined" class="mb-1">
              <span class="text-slate-500">分组索引:</span> <span class="text-pink-400 font-bold">Group {{ displayedNode.groupIndex }}</span>
            </div>
            <div v-if="displayedNode.min !== undefined" class="mb-1">
              <span class="text-slate-500">数量范围:</span>
              <span class="text-orange-400 font-mono">
                {{ displayedNode.min }}{{ displayedNode.max !== undefined ? (displayedNode.min === displayedNode.max ? '' : `-${displayedNode.max}`) : '+' }}
              </span>
            </div>
          </div>
          <div class="border-t border-slate-700 pt-3">
            <div class="text-xs text-slate-500 mb-1">说明</div>
            <div class="text-sm text-slate-300 leading-relaxed">{{ displayedNode.description }}</div>
          </div>
          <div class="border-t border-slate-700 pt-3">
            <div class="text-xs text-slate-500 mb-1">示例</div>
            <div class="text-sm text-emerald-400 font-mono bg-slate-800 px-2 py-1 rounded">{{ displayedNode.example }}</div>
          </div>
          <div v-if="displayedNode.children && displayedNode.children.length > 0" class="border-t border-slate-700 pt-3">
            <div class="text-xs text-slate-500 mb-2">子节点 ({{ displayedNode.children.length }})</div>
            <div class="space-y-1">
              <div v-for="(child, i) in displayedNode.children" :key="i"
                class="text-xs px-2 py-1.5 bg-slate-800 rounded flex items-center gap-2 cursor-pointer hover:bg-slate-700 transition-colors"
                @click="onChildClick(child)">
                <span class="inline-block w-2 h-2 rounded flex-shrink-0" :style="{ backgroundColor: store.getNodeInfo(child.type).color }"></span>
                <span class="text-slate-300 truncate">{{ getChildLabel(child) }}</span>
                <span v-if="child.value" class="text-cyan-400 ml-auto font-mono text-xs truncate max-w-20">{{ child.value }}</span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="text-slate-500 text-sm text-center py-8">
          <div class="text-2xl mb-2">👆</div>
          <div>悬停或点击节点查看详情</div>
        </div>
      </div>
    </div>

    <div v-if="store.activeAstHighlight && store.nfa" class="mt-3 text-xs text-slate-500 flex items-center gap-2">
      <span class="inline-block w-3 h-3 rounded-full bg-violet-500"></span>
      NFA 状态机中已高亮显示与该节点相关的状态路径
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineComponent, h, PropType } from 'vue'
import { useRegexStore } from '../store/regex'
import type { ASTNode } from '../types'

const store = useRegexStore()
const hoveredCharIndex = ref<number | null>(null)

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

const patternChars = computed(() => {
  return store.pattern.split('')
})

const hoveredNodeInfo = computed(() => {
  if (hoveredCharIndex.value === null || !store.ast) return ''
  const node = findNodeAtPosition(store.ast, hoveredCharIndex.value)
  if (!node) return ''
  const info = store.getNodeInfo(node.type)
  return `${info.typeLabel} - ${node.description}`
})

function findNodeAtPosition(node: ASTNode, pos: number): ASTNode | null {
  if (pos < node.start || pos >= node.end) return null
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeAtPosition(child, pos)
      if (found) return found
    }
  }
  return node
}

function getCharClass(idx: number): string {
  const node = displayedNode.value
  if (!node) return 'text-cyan-400'

  const isInRange = idx >= node.start && idx < node.end
  if (isInRange) {
    if (store.selectedAstNodeId && displayedNode.value?.id === store.selectedAstNodeId) {
      return 'bg-cyan-600 text-white font-bold'
    }
    return 'bg-yellow-600/60 text-yellow-100'
  }
  return 'text-cyan-400 opacity-60'
}

function getCharStyle(idx: number): Record<string, string> {
  const node = displayedNode.value
  if (!node) return {}
  const isInRange = idx >= node.start && idx < node.end
  if (isInRange) {
    return { borderRadius: '2px' }
  }
  return {}
}

function getNodeAtCharIndex(idx: number): ASTNode | null {
  if (!store.ast) return null
  return findNodeAtPosition(store.ast, idx)
}

function onCharClick(idx: number) {
  const node = getNodeAtCharIndex(idx)
  if (node) {
    if (store.selectedAstNodeId === node.id) {
      store.selectAstNode(null)
    } else {
      store.selectAstNode(node.id)
    }
  }
}

function onCharHover(idx: number) {
  hoveredCharIndex.value = idx
  if (!store.selectedAstNodeId) {
    const node = getNodeAtCharIndex(idx)
    if (node) {
      store.hoverAstNode(node.id)
    }
  }
}

function onCharLeave() {
  hoveredCharIndex.value = null
  if (!store.selectedAstNodeId) {
    store.hoverAstNode(null)
  }
}

function getChildLabel(child: ASTNode): string {
  const info = store.getNodeInfo(child.type)
  if (child.type === 'char' && child.value) {
    return `${info.typeLabel} '${child.value}'`
  }
  if (child.type === 'brace' && child.value) {
    return `${info.typeLabel} ${child.value}`
  }
  if (child.type === 'star' || child.type === 'plus' || child.type === 'question') {
    return `${info.typeLabel}`
  }
  if (child.groupIndex !== undefined) {
    return `${info.typeLabel} ${child.groupIndex}`
  }
  return info.typeLabel
}

function onChildClick(child: ASTNode) {
  store.selectAstNode(child.id)
  if (!store.isAstNodeExpanded(child.id) && child.children && child.children.length > 0) {
    store.toggleAstNodeExpanded(child.id)
  }
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

    const nodeLabel = computed(() => {
      const base = info.value.typeLabel
      if (props.node.type === 'char' && props.node.value) {
        return `字符 '${props.node.value}'`
      }
      if (props.node.type === 'charclass') {
        return `字符类 [${props.node.value}]`
      }
      if (props.node.type === 'brace' && props.node.value) {
        return `量词 ${props.node.value}`
      }
      if (props.node.type === 'anchor' && props.node.value) {
        return `锚点 ${props.node.value === '^' ? '行首' : '行尾'}`
      }
      if (props.node.groupIndex !== undefined) {
        return `捕获组 ${props.node.groupIndex}`
      }
      if (props.node.type === 'dot') {
        return '任意字符 .'
      }
      if (props.node.type === 'digit') {
        return '数字 \\d'
      }
      if (props.node.type === 'word') {
        return '单词字符 \\w'
      }
      if (props.node.type === 'space') {
        return '空白字符 \\s'
      }
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
      const indent = props.level * 18

      return h('div', {
        class: 'select-none',
        onClick: onToggle,
        onMouseenter: onMouseEnter,
        onMouseleave: onMouseLeave
      }, [
        h('div', {
          class: [
            'flex items-center py-1.5 px-2 rounded cursor-pointer transition-all duration-150 -mx-2 group',
            isSelected.value ? 'bg-cyan-900/40 border-l-2 border-cyan-400' :
            isHovered.value ? 'bg-slate-700/40 border-l-2 border-yellow-400' :
            'border-l-2 border-transparent hover:bg-slate-700/20'
          ],
          style: { paddingLeft: `${indent + 8}px` },
          onClick: onNodeClick
        }, [
          hasChildren.value ? h('span', {
            class: 'mr-1.5 text-slate-500 hover:text-slate-300 transition-colors w-4 text-center text-xs font-bold'
          }, isExpanded.value ? '▾' : '▸') : h('span', { class: 'mr-1.5 w-4' }),

          h('span', {
            class: 'inline-block w-2.5 h-2.5 rounded-sm mr-2 flex-shrink-0',
            style: { backgroundColor: info.value.color }
          }),

          h('span', {
            class: [
              'text-sm',
              isSelected.value ? 'text-cyan-300 font-semibold' :
              isHovered.value ? 'text-yellow-300 font-medium' : 'text-slate-300'
            ]
          }, nodeLabel.value),

          h('span', {
            class: 'ml-auto text-xs text-slate-600 font-mono opacity-0 group-hover:opacity-100 transition-opacity'
          }, `[${props.node.start}:${props.node.end}]`)
        ]),

        hasChildren.value && isExpanded.value
          ? h('div', {}, props.node.children!.map((child: ASTNode) =>
              h(AstTreeNode, { key: child.id, node: child, level: props.level + 1 })
            ))
          : null
      ])
    }
  }
})
</script>
