import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { NFA, MatchResult, MatchStep, RegexTemplate, ASTNode, AstNodeInfo, AstNodeHighlight } from '../types'

const AST_NODE_INFO: Record<string, AstNodeInfo> = {
  char: { typeLabel: '字符', description: '匹配单个指定字符', example: 'a 匹配字符 "a"', color: '#22c55e' },
  star: { typeLabel: '* 零次或多次', description: '匹配前面的元素零次或多次（贪婪模式）', example: 'a* 匹配 "", "a", "aa", "aaa"...', color: '#f97316' },
  plus: { typeLabel: '+ 一次或多次', description: '匹配前面的元素一次或多次（贪婪模式）', example: 'a+ 匹配 "a", "aa", "aaa"...', color: '#f97316' },
  question: { typeLabel: '? 零次或一次', description: '匹配前面的元素零次或一次（贪婪模式）', example: 'a? 匹配 "" 或 "a"', color: '#f97316' },
  brace: { typeLabel: '{n,m} 量词', description: '匹配前面的元素指定次数', example: 'a{2,5} 匹配 "aa" 到 "aaaaa"', color: '#fb923c' },
  or: { typeLabel: '| 或运算', description: '匹配左边或右边的表达式', example: 'a|b 匹配 "a" 或 "b"', color: '#8b5cf6' },
  concat: { typeLabel: '连接', description: '按顺序连接多个元素', example: 'ab 匹配 "a" 后跟 "b"', color: '#3b82f6' },
  group: { typeLabel: '捕获组', description: '将多个元素组合成一个组并捕获匹配内容', example: '(ab) 捕获 "ab" 作为分组', color: '#ec4899' },
  dot: { typeLabel: '. 任意字符', description: '匹配除换行符外的任意单个字符', example: '. 匹配 "a", "1", "@"...', color: '#14b8a6' },
  anchor: { typeLabel: '锚点', description: '匹配字符串的开始或结束位置', example: '^a 匹配行首, a$ 匹配行尾', color: '#eab308' },
  charclass: { typeLabel: '字符类', description: '匹配方括号内的任意一个字符', example: '[a-z] 匹配任意小写字母', color: '#06b6d4' },
  digit: { typeLabel: '\\d 数字', description: '匹配任意数字字符 (0-9)', example: '\\d 匹配 "0"-"9"', color: '#06b6d4' },
  word: { typeLabel: '\\w 单词字符', description: '匹配字母、数字或下划线', example: '\\w 匹配 "a", "Z", "5", "_"', color: '#06b6d4' },
  space: { typeLabel: '\\s 空白字符', description: '匹配空格、制表符、换行符等空白字符', example: '\\s 匹配 " ", "\\t", "\\n"', color: '#06b6d4' }
}

function getAstNodeInfo(type: string): AstNodeInfo {
  return AST_NODE_INFO[type] || { typeLabel: type, description: '未知节点类型', example: '', color: '#64748b' }
}

const GROUP_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']

export const TEMPLATES: RegexTemplate[] = [
  { name: '邮箱地址', pattern: '^([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+)\\.([a-zA-Z]{2,})$', description: '匹配标准邮箱格式：用户名@域名.顶级域', testString: 'user@example.com admin@mail.org test.user+tag@sub.domain.co.uk', category: '常用' },
  { name: 'URL链接', pattern: '^(https?)://([^/:]+)(?::(\\d+))?(.*)$', description: '匹配HTTP/HTTPS URL：协议://主机:端口/路径', testString: 'https://www.example.com:8080/path/to/page http://localhost:3000/api', category: '常用' },
  { name: 'IPv4地址', pattern: '^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$', description: '匹配IPv4地址四段数字', testString: '192.168.1.1 10.0.0.1 255.255.255.0', category: '常用' },
  { name: '日期格式', pattern: '^(\\d{4})-(\\d{2})-(\\d{2})$', description: '匹配YYYY-MM-DD日期', testString: '2024-01-15 1999-12-31 2025-06-06', category: '常用' },
  { name: '手机号码', pattern: '^1[3-9]\\d{9}$', description: '匹配中国大陆手机号', testString: '13800138000 15912345678 18600000000', category: '常用' },
  { name: '身份证号', pattern: '^(\\d{6})(\\d{4})(\\d{2})(\\d{2})(\\d{3})([0-9Xx])$', description: '18位身份证：地区码+出生日期+顺序码+校验码', testString: '11010119900101001X 440304200512120039', category: '常用' },
  { name: '十六进制颜色', pattern: '^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$', description: '匹配#RGB或#RRGGBB格式', testString: '#FF5733 #abc #1A2B3C ff0000', category: '前端' },
  { name: '邮政编码', pattern: '^\\d{6}$', description: '6位中国邮编', testString: '100000 518000 200120', category: '常用' },
  { name: '浮点数', pattern: '^-?\\d+\\.\\d+$', description: '匹配带小数点的数字', testString: '3.14 -0.5 100.0', category: '数字' },
  { name: '科学计数法', pattern: '^-?\\d+(\\.\\d+)?[eE][+-]?\\d+$', description: '匹配科学计数法数字', testString: '1.5e10 -2.3E-4 6.022e23', category: '数字' },
  { name: 'MAC地址', pattern: '^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$', description: '匹配MAC地址XX:XX:XX:XX:XX:XX', testString: '00:1A:2B:3C:4D:5E AA-BB-CC-DD-EE-FF', category: '网络' },
  { name: 'UUID', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', description: '标准UUID格式', testString: '550e8400-e29b-41d4-a716-446655440000', category: '网络' },
  { name: 'QQ号', pattern: '^[1-9]\\d{4,10}$', description: '5-11位QQ号', testString: '12345 10000 1234567890', category: '常用' },
  { name: '密码强度', pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$', description: '至少8位含大小写字母数字特殊字符', testString: 'Passw0rd! Str0ng@Pass', category: '安全' },
  { name: '中文姓名', pattern: '^[\\u4e00-\\u9fa5]{2,4}$', description: '2-4位中文字符', testString: '张三 李世明 王小明', category: '常用' },
  { name: '车牌号', pattern: '^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-Z][A-HJ-NP-Z0-9]{5}$', description: '中国车牌格式', testString: '京A12345 沪B6789X', category: '常用' },
  { name: 'HTML标签', pattern: '<(\\w+)(\\s[^>]*)?>(.*?)</\\1>', description: '匹配HTML开闭标签对', testString: '<div class="x">content</div> <span>text</span>', category: '前端' },
  { name: '文件扩展名', pattern: '^.+\\.(\\w+)$', description: '提取文件扩展名', testString: 'image.png doc.pdf index.html', category: '前端' },
  { name: '经纬度', pattern: '^(\\-?\\d{1,3}\\.\\d+)\\s*,\\s*(\\-?\\d{1,3}\\.\\d+)$', description: '匹配经纬度坐标', testString: '116.404,39.915 -73.9857,40.7484', category: '地理' },
  { name: '版本号', pattern: '^(\\d+)\\.(\\d+)\\.(\\d+)(?:-(\\w+))?$', description: '语义化版本号x.y.z-tag', testString: '1.0.0 2.3.1-beta 10.20.30', category: '常用' },
  { name: '时间格式', pattern: '^([01]?\\d|2[0-3]):([0-5]\\d)(?::([0-5]\\d))?$', description: 'HH:MM或HH:MM:SS', testString: '14:30 23:59:59 00:00', category: '常用' }
]

interface StateNode {
  id: number
  isAccept: boolean
  transitions: Map<string, number[]>
  epsilonTransitions: number[]
}

function buildNFA(pattern: string): { states: StateNode[]; startState: number; acceptStates: number[] } {
  const states: StateNode[] = []
  let stateCounter = 0
  let pos = 0
  let groupCount = 0

  function newState(): number {
    const id = stateCounter++
    states.push({ id, isAccept: false, transitions: new Map(), epsilonTransitions: [] })
    return id
  }

  function addTransition(from: number, symbol: string, to: number) {
    if (!states[from].transitions.has(symbol)) {
      states[from].transitions.set(symbol, [])
    }
    states[from].transitions.get(symbol)!.push(to)
  }

  function addEpsilon(from: number, to: number) {
    states[from].epsilonTransitions.push(to)
  }

  function parseCharClass(): (ch: string) => boolean {
    const negative = pattern[pos] === '^'
    if (negative) pos++
    const ranges: [string, string][] = []
    const chars: string[] = []
    while (pos < pattern.length && pattern[pos] !== ']') {
      if (pattern[pos + 1] === '-' && pattern[pos + 2] && pattern[pos + 2] !== ']') {
        ranges.push([pattern[pos], pattern[pos + 2]])
        pos += 3
      } else {
        chars.push(pattern[pos])
        pos++
      }
    }
    pos++ // skip ]
    return (ch: string) => {
      if (negative) {
        return !chars.includes(ch) && !ranges.some(([s, e]) => ch >= s && ch <= e)
      }
      return chars.includes(ch) || ranges.some(([s, e]) => ch >= s && ch <= e)
    }
  }

  function parseConcat(): [number, number] {
    let start = newState()
    let end = start
    while (pos < pattern.length && !['|', ')'].includes(pattern[pos])) {
      let segStart: number, segEnd: number
      const ch = pattern[pos]
      if (ch === '(') {
        pos++
        groupCount++
        if (pattern[pos] === '?') {
          pos++
          if (pattern[pos] === ':') { pos++; }
          const [s, e] = parseOr()
          segStart = s; segEnd = e
        } else {
          const [s, e] = parseOr()
          segStart = s; segEnd = e
        }
        pos++ // skip )
      } else if (ch === '[') {
        pos++
        segStart = newState()
        segEnd = newState()
        const matcher = parseCharClass()
        addTransition(segStart, '__class_' + segStart, segEnd)
        ;(states[segEnd] as any)._matcher = matcher
      } else if (ch === '.') {
        segStart = newState()
        segEnd = newState()
        addTransition(segStart, '__dot', segEnd)
        pos++
      } else if (ch === '\\') {
        pos++
        const escaped = pattern[pos]
        segStart = newState()
        segEnd = newState()
        if (escaped === 'd') addTransition(segStart, '__digit', segEnd)
        else if (escaped === 'w') addTransition(segStart, '__word', segEnd)
        else if (escaped === 's') addTransition(segStart, '__space', segEnd)
        else addTransition(segStart, escaped, segEnd)
        pos++
      } else if (ch === '^' || ch === '$') {
        segStart = newState()
        segEnd = segStart
        pos++
      } else {
        segStart = newState()
        segEnd = newState()
        addTransition(segStart, ch, segEnd)
        pos++
      }

      // Handle quantifiers
      while (pos < pattern.length && ['*', '+', '?', '{'].includes(pattern[pos])) {
        const q = pattern[pos]
        if (q === '{') {
          while (pos < pattern.length && pattern[pos] !== '}') pos++
          pos++
        } else {
          pos++
        }
        const qStart = newState()
        const qEnd = newState()
        addEpsilon(qStart, segStart)
        if (q === '*') { addEpsilon(qStart, qEnd); addEpsilon(segEnd, qEnd); addEpsilon(segEnd, segStart) }
        else if (q === '+') { addEpsilon(segEnd, qEnd); addEpsilon(segEnd, segStart) }
        else if (q === '?') { addEpsilon(qStart, qEnd); addEpsilon(segEnd, qEnd) }
        segStart = qStart; segEnd = qEnd
        if (pos < pattern.length && pattern[pos] === '?') pos++ // lazy
      }

      if (end !== segStart) addEpsilon(end, segStart)
      end = segEnd
    }
    return [start, end]
  }

  function parseOr(): [number, number] {
    const [s1, e1] = parseConcat()
    let start = s1, end = e1
    while (pos < pattern.length && pattern[pos] === '|') {
      pos++
      const [s2, e2] = parseConcat()
      const ns = newState(), ne = newState()
      addEpsilon(ns, start); addEpsilon(ns, s2)
      addEpsilon(end, ne); addEpsilon(e2, ne)
      start = ns; end = ne
    }
    return [start, end]
  }

  const [startState, acceptState] = parseOr()
  states[acceptState].isAccept = true
  return { states, startState, acceptStates: [acceptState] }
}

function epsilonClosure(states: StateNode[], stateId: number): Set<number> {
  const closure = new Set<number>([stateId])
  const stack = [stateId]
  while (stack.length) {
    const s = stack.pop()!
    for (const next of states[s].epsilonTransitions) {
      if (!closure.has(next)) {
        closure.add(next)
        stack.push(next)
      }
    }
  }
  return closure
}

function matchTransition(state: StateNode, symbol: string): number[] {
  const results: number[] = []
  for (const [sym, targets] of state.transitions) {
    if (sym === symbol) { results.push(...targets); continue }
    if (sym === '__dot' && symbol !== '\n') { results.push(...targets); continue }
    if (sym === '__digit' && /\d/.test(symbol)) { results.push(...targets); continue }
    if (sym === '__word' && /\w/.test(symbol)) { results.push(...targets); continue }
    if (sym === '__space' && /\s/.test(symbol)) { results.push(...targets); continue }
    if (sym.startsWith('__class_')) {
      const matcher = (state as any)._matcher
      if (matcher && matcher(symbol)) results.push(...targets)
    }
  }
  return results
}

function runMatch(states: StateNode[], startState: number, input: string): MatchResult {
  const steps: MatchStep[] = []
  let backtracks = 0
  let stepIndex = 0
  const startTime = performance.now()

  // Try to match from each position
  for (let startPos = 0; startPos <= input.length; startPos++) {
    let currentStates = Array.from(epsilonClosure(states, startState))
    let matched = false
    let matchEnd = startPos

    for (let i = startPos; i < input.length; i++) {
      const char = input[i]
      const nextStates: number[] = []
      const seen = new Set<number>()

      for (const s of currentStates) {
        const targets = matchTransition(states[s], char)
        for (const t of targets) {
          const closure = epsilonClosure(states, t)
          for (const c of closure) {
            if (!seen.has(c)) {
              seen.add(c)
              nextStates.push(c)
              steps.push({
                stepIndex: stepIndex++,
                charIndex: i,
                char,
                currentState: s,
                nextState: c,
                transition: char,
                isBacktrack: false,
                isMatch: true
              })
            }
          }
        }
      }

      if (nextStates.length === 0) {
        if (currentStates.some(s => states[s].isAccept)) { matched = true; matchEnd = i; break }
        backtracks++
        steps.push({
          stepIndex: stepIndex++,
          charIndex: i,
          char,
          currentState: currentStates[0] || -1,
          nextState: -1,
          transition: 'FAIL',
          isBacktrack: true,
          isMatch: false
        })
        break
      }
      currentStates = nextStates
      if (currentStates.some(s => states[s].isAccept)) { matched = true; matchEnd = i + 1 }
    }

    if (matched || (startPos === input.length && currentStates.some(s => states[s].isAccept))) {
      const matchText = input.substring(startPos, matchEnd)
      const duration = performance.now() - startTime
      return {
        matched: true,
        matchText,
        groups: [matchText],
        steps,
        backtracks,
        totalSteps: stepIndex,
        duration: Math.round(duration * 100) / 100
      }
    }
  }

  const duration = performance.now() - startTime
  return { matched: false, matchText: '', groups: [], steps, backtracks, totalSteps: stepIndex, duration: Math.round(duration * 100) / 100 }
}

export function computeNFA(nfaResult: ReturnType<typeof buildNFA>): NFA {
  const nodes = nfaResult.states.map((s, i) => ({
    id: s.id,
    isStart: i === nfaResult.startState,
    isAccept: nfaResult.acceptStates.includes(s.id),
    x: 0, y: 0
  }))

  // Layout: circular
  const cx = 400, cy = 300, radius = 200
  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2
    n.x = cx + Math.cos(angle) * radius
    n.y = cy + Math.sin(angle) * radius
  })

  const transitions: any[] = []
  nfaResult.states.forEach(s => {
    s.transitions.forEach((targets, symbol) => {
      targets.forEach(t => {
        transitions.push({ from: s.id, to: t, symbol: symbol.startsWith('__') ? symbol.replace('__', '') : symbol, label: symbol.startsWith('__') ? symbol.replace('__', '') : symbol })
      })
    })
    s.epsilonTransitions.forEach(t => {
      transitions.push({ from: s.id, to: t, symbol: null, label: 'ε' })
    })
  })

  return { states: nodes, transitions, startState: nfaResult.startState, acceptStates: nfaResult.acceptStates }
}

let nodeIdCounter = 0

function createNode(type: ASTNode['type'], start: number, end: number, extra: Partial<ASTNode> = {}): ASTNode {
  const info = getAstNodeInfo(type)
  return {
    type,
    start,
    end,
    id: `ast-node-${nodeIdCounter++}`,
    description: info.description,
    example: info.example,
    ...extra
  }
}

export function parseAST(pattern: string): ASTNode {
  let pos = 0
  let groupIdx = 0
  nodeIdCounter = 0

  function parseAtom(): ASTNode {
    const start = pos
    const ch = pattern[pos]
    if (ch === '(') {
      pos++
      const isNonCapturing = pattern[pos] === '?'
      if (isNonCapturing) { pos++; if (pattern[pos] === ':') pos++ }
      else groupIdx++
      const node = parseOr()
      if (pattern[pos] === ')') pos++
      const info = getAstNodeInfo('group')
      return createNode('group', start, pos, {
        children: [node],
        groupIndex: isNonCapturing ? undefined : groupIdx,
        description: isNonCapturing ? '非捕获组：将多个元素组合但不捕获匹配内容' : info.description,
        example: isNonCapturing ? '(?:ab) 分组但不捕获' : info.example
      })
    }
    if (ch === '[') {
      pos++
      let cls = ''
      while (pos < pattern.length && pattern[pos] !== ']') { cls += pattern[pos]; pos++ }
      pos++
      return createNode('charclass', start, pos, { value: cls })
    }
    if (ch === '.') {
      pos++
      return createNode('dot', start, pos)
    }
    if (ch === '\\') {
      pos++
      const e = pattern[pos]; pos++
      if (e === 'd') return createNode('digit', start, pos)
      if (e === 'w') return createNode('word', start, pos)
      if (e === 's') return createNode('space', start, pos)
      return createNode('char', start, pos, { value: e })
    }
    if (ch === '^' || ch === '$') {
      pos++
      return createNode('anchor', start, pos, { value: ch })
    }
    pos++
    return createNode('char', start, pos, { value: ch })
  }

  function parseBraceQuantifier(): { min: number; max: number | undefined; lazy: boolean } | null {
    if (pattern[pos] !== '{') return null
    const startPos = pos
    pos++
    let minStr = ''
    let maxStr = ''
    let hasComma = false

    while (pos < pattern.length && pattern[pos] !== '}') {
      if (pattern[pos] === ',') {
        hasComma = true
        pos++
        continue
      }
      if (!hasComma) {
        minStr += pattern[pos]
      } else {
        maxStr += pattern[pos]
      }
      pos++
    }
    if (pos >= pattern.length || pattern[pos] !== '}') {
      pos = startPos
      return null
    }
    pos++

    const min = parseInt(minStr, 10)
    const max = hasComma ? (maxStr ? parseInt(maxStr, 10) : undefined) : min

    const lazy = pos < pattern.length && pattern[pos] === '?'
    if (lazy) pos++

    return { min, max, lazy }
  }

  function parseQuantifier(): ASTNode {
    const start = pos
    let node = parseAtom()
    while (pos < pattern.length && ['*', '+', '?', '{'].includes(pattern[pos])) {
      const q = pattern[pos]
      const qStart = pos

      if (q === '{') {
        const braceInfo = parseBraceQuantifier()
        if (!braceInfo) break
        const info = getAstNodeInfo('brace')
        const rangeText = braceInfo.max === undefined
          ? `${braceInfo.min},`
          : braceInfo.min === braceInfo.max
            ? String(braceInfo.min)
            : `${braceInfo.min},${braceInfo.max}`
        const lazyText = braceInfo.lazy ? '?' : ''
        const description = braceInfo.max === undefined
          ? `匹配前面的元素至少 ${braceInfo.min} 次`
          : braceInfo.min === braceInfo.max
            ? `匹配前面的元素恰好 ${braceInfo.min} 次`
            : `匹配前面的元素 ${braceInfo.min} 到 ${braceInfo.max} 次`
        const example = `a{${rangeText}}${lazyText}`

        node = createNode('brace', start, pos, {
          children: [node],
          value: `{${rangeText}}${lazyText}`,
          min: braceInfo.min,
          max: braceInfo.max,
          description: description + (braceInfo.lazy ? '（非贪婪模式）' : '（贪婪模式）'),
          example
        })
      } else {
        pos++
        const type = q === '*' ? 'star' : q === '+' ? 'plus' : 'question'
        const info = getAstNodeInfo(type)
        const lazy = pos < pattern.length && pattern[pos] === '?'
        if (lazy) pos++
        node = createNode(type, start, pos, {
          children: [node],
          value: q + (lazy ? '?' : ''),
          description: info.description.replace('（贪婪模式）', lazy ? '（非贪婪模式）' : '（贪婪模式）'),
          example: info.example
        })
      }
    }
    return node
  }

  function parseConcat(): ASTNode {
    const start = pos
    const nodes: ASTNode[] = []
    while (pos < pattern.length && !['|', ')'].includes(pattern[pos])) {
      nodes.push(parseQuantifier())
    }
    if (nodes.length === 1) return nodes[0]
    return createNode('concat', start, pos, { children: nodes })
  }

  function parseOr(): ASTNode {
    const start = pos
    let left = parseConcat()
    while (pos < pattern.length && pattern[pos] === '|') {
      pos++
      const right = parseConcat()
      left = createNode('or', start, pos, { children: [left, right] })
    }
    return left
  }

  return parseOr()
}

export function getNodeInfo(type: string): AstNodeInfo {
  return getAstNodeInfo(type)
}

export function findNodeById(node: ASTNode, id: string): ASTNode | null {
  if (node.id === id) return node
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeById(child, id)
      if (found) return found
    }
  }
  return null
}

export function collectNodeHighlights(node: ASTNode): AstNodeHighlight[] {
  const result: AstNodeHighlight[] = [{ start: node.start, end: node.end, nodeId: node.id }]
  if (node.children) {
    for (const child of node.children) {
      result.push(...collectNodeHighlights(child))
    }
  }
  return result
}

export const useRegexStore = defineStore('regex', () => {
  const pattern = ref('^([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+)\\.([a-zA-Z]{2,})$')
  const testString = ref('user@example.com admin@mail.org invalid-email')
  const currentStep = ref(0)
  const isPlaying = ref(false)
  const nfa = ref<NFA | null>(null)
  const matchResult = ref<MatchResult | null>(null)
  const ast = ref<ASTNode | null>(null)
  const error = ref('')
  const selectedTemplate = ref<string>('')
  const selectedAstNodeId = ref<string | null>(null)
  const hoveredAstNodeId = ref<string | null>(null)
  const expandedAstNodes = ref<Set<string>>(new Set())

  const groupColors = GROUP_COLORS

  const selectedAstNode = computed(() => {
    if (!ast.value || !selectedAstNodeId.value) return null
    return findNodeById(ast.value, selectedAstNodeId.value)
  })

  const hoveredAstNode = computed(() => {
    if (!ast.value || !hoveredAstNodeId.value) return null
    return findNodeById(ast.value, hoveredAstNodeId.value)
  })

  const activeAstHighlight = computed(() => {
    return hoveredAstNode.value || selectedAstNode.value
  })

  const highlightedPatternSegments = computed(() => {
    if (!ast.value) return []
    return collectNodeHighlights(ast.value)
  })

  const matchHighlight = computed(() => {
    if (!matchResult.value || !matchResult.value.matched) return null
    const matchText = matchResult.value.matchText
    const idx = testString.value.indexOf(matchText)
    if (idx === -1) return null
    return {
      before: testString.value.substring(0, idx),
      match: matchText,
      after: testString.value.substring(idx + matchText.length)
    }
  })

  function execute() {
    error.value = ''
    try {
      const built = buildNFA(pattern.value)
      nfa.value = computeNFA(built)
      matchResult.value = runMatch(built.states, built.startState, testString.value)
      ast.value = parseAST(pattern.value)
      currentStep.value = 0
      selectedAstNodeId.value = null
      hoveredAstNodeId.value = null
      expandedAstNodes.value = new Set()
    } catch (e: any) {
      error.value = e.message || '正则表达式解析错误'
      nfa.value = null
      matchResult.value = null
      ast.value = null
      selectedAstNodeId.value = null
      hoveredAstNodeId.value = null
      expandedAstNodes.value = new Set()
    }
  }

  function selectAstNode(id: string | null) {
    selectedAstNodeId.value = id
  }

  function hoverAstNode(id: string | null) {
    hoveredAstNodeId.value = id
  }

  function toggleAstNodeExpanded(id: string) {
    const newSet = new Set(expandedAstNodes.value)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    expandedAstNodes.value = newSet
  }

  function isAstNodeExpanded(id: string): boolean {
    return expandedAstNodes.value.has(id)
  }

  function expandAllAstNodes() {
    if (!ast.value) return
    const allIds = collectNodeHighlights(ast.value).map(h => h.nodeId)
    expandedAstNodes.value = new Set(allIds)
  }

  function collapseAllAstNodes() {
    expandedAstNodes.value = new Set()
  }

  function setPattern(p: string) {
    pattern.value = p
    execute()
  }

  function setTestString(s: string) {
    testString.value = s
    execute()
  }

  function applyTemplate(t: RegexTemplate) {
    pattern.value = t.pattern
    testString.value = t.testString
    selectedTemplate.value = t.name
    execute()
  }

  function stepForward() {
    if (matchResult.value && currentStep.value < matchResult.value.steps.length - 1) {
      currentStep.value++
    }
  }

  function stepBackward() {
    if (currentStep.value > 0) currentStep.value--
  }

  function resetStep() {
    currentStep.value = 0
  }

  function play() {
    isPlaying.value = true
    const interval = setInterval(() => {
      if (matchResult.value && currentStep.value < matchResult.value.steps.length - 1) {
        currentStep.value++
      } else {
        isPlaying.value = false
        clearInterval(interval)
      }
    }, 200)
  }

  function stop() {
    isPlaying.value = false
  }

  return {
    pattern, testString, currentStep, isPlaying, nfa, matchResult, ast, error,
    selectedTemplate, groupColors, matchHighlight,
    selectedAstNodeId, hoveredAstNodeId, selectedAstNode, hoveredAstNode,
    activeAstHighlight, highlightedPatternSegments,
    execute, setPattern, setTestString, applyTemplate,
    stepForward, stepBackward, resetStep, play, stop,
    selectAstNode, hoverAstNode, toggleAstNodeExpanded,
    isAstNodeExpanded, expandAllAstNodes, collapseAllAstNodes,
    getNodeInfo
  }
})
