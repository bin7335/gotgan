import type { Course } from './types'

/**
 * 운영계획서(hwpx) 시간표 파서.
 * hwpx는 ZIP + XML(OWPML) 구조로, 표 셀마다 좌표(cellAddr)와 병합(cellSpan)
 * 정보가 있어 병합이 많은 시간표도 정확히 복원할 수 있다.
 *
 * 지원하는 표 형태 두 가지:
 * - 격자형: 행 = 교시, 열 = 요일. 과목이 셀로 들어 있는 주간 시간표.
 * - 목록형: 행 = 강좌. 구분/강사/요일/시간 열이 있는 표.
 */

export interface HwpxCell {
  text: string
  col: number
  row: number
  colSpan: number
  rowSpan: number
}

export interface HwpxTable {
  /** 표 바로 앞의 문단 텍스트 (제목 추정) */
  heading: string
  cells: HwpxCell[]
  rowCount: number
  colCount: number
}

export interface ExtractedCourse {
  name: string
  instructor?: string
  /** 0=일 ~ 6=토 */
  weekdays: number[]
  /** 하루 교시 수를 시수로 계상 */
  hoursPerSession: number
}

const WEEKDAY_INDEX: Record<string, number> = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6,
}

function textOf(fragment: string): string {
  return [...fragment.matchAll(/<hp:t[^>]*>([^<]*)<\/hp:t>/g)]
    .map((m) => m[1])
    .join('')
    .trim()
}

/** section XML에서 표 목록을 (직전 제목과 함께) 추출한다 */
export function parseHwpxSection(xml: string): HwpxTable[] {
  const tables: HwpxTable[] = []
  const tblRe = /<hp:tbl\b[^>]*>[\s\S]*?<\/hp:tbl>/g
  let last = 0
  let heading = ''
  let m: RegExpExecArray | null
  while ((m = tblRe.exec(xml))) {
    const before = textOf(xml.slice(last, m.index))
    if (before) heading = before.slice(-120)
    last = m.index + m[0].length

    const cells: HwpxCell[] = []
    const tcRe = /<hp:tc\b[^>]*>([\s\S]*?)<\/hp:tc>/g
    let tc: RegExpExecArray | null
    while ((tc = tcRe.exec(m[0]))) {
      const addr = tc[1].match(/<hp:cellAddr\s+colAddr="(\d+)"\s+rowAddr="(\d+)"/)
      const span = tc[1].match(/<hp:cellSpan\s+colSpan="(\d+)"\s+rowSpan="(\d+)"/)
      if (!addr) continue
      cells.push({
        text: textOf(tc[1]),
        col: Number(addr[1]),
        row: Number(addr[2]),
        colSpan: span ? Number(span[1]) : 1,
        rowSpan: span ? Number(span[2]) : 1,
      })
    }
    if (cells.length === 0) continue
    tables.push({
      heading,
      cells,
      rowCount: Math.max(...cells.map((c) => c.row + c.rowSpan)),
      colCount: Math.max(...cells.map((c) => c.col + c.colSpan)),
    })
  }
  return tables
}

export type TableShape = 'grid' | 'list' | 'unknown'

export function classifyTable(t: HwpxTable): TableShape {
  const headTexts = t.cells.filter((c) => c.row <= 1).map((c) => c.text)
  const has = (kw: string) => headTexts.some((x) => x.includes(kw))
  const weekdayHeads = headTexts.filter((x) => /^[월화수목금토일]$/.test(x)).length
  if (has('교시') && weekdayHeads >= 2) return 'grid'
  if (has('요일') && (has('구분') || has('강좌') || has('프로그램') || has('과목')))
    return 'list'
  return 'unknown'
}

/**
 * 셀 텍스트가 강좌명인지 판정하고 정리한다. 아니면 null.
 * 셀 안에 임의의 공백이 섞이므로("오후 돌봄", "로봇과학 A") 공백을 제거해 정규화한다.
 */
function courseName(raw: string): string | null {
  let s = raw.replace(/\s+/g, '')
  if (!s) return null
  if (s.includes('정규수업')) return null
  // '예술아놀자C:오후돌봄' → 예술아놀자C, '오후돌봄:늘봄교실' → 제외
  if (s.includes(':')) s = s.split(':')[0]
  if (/^(오후|아침)?돌봄/.test(s) || s.startsWith('늘봄')) return null
  s = s.replace(/\([^)]*\)/g, '') // 장소 괄호 제거
  if (!s) return null
  if (/^\d+명?$/.test(s)) return null // 인원
  if (/^[\d,~∼\-·]+$/.test(s)) return null // 학년 표기 (1,2,4 / 1~2 등)
  if (['과목', '학년', '인원', '전학년', '교시', '시간'].includes(s)) return null
  return s
}

function aggregate(
  occurrences: { name: string; instructor?: string; day: number; periods: number }[],
): ExtractedCourse[] {
  const byName = new Map<string, { instructor?: string; perDay: Map<number, number> }>()
  for (const o of occurrences) {
    let e = byName.get(o.name)
    if (!e) {
      e = { instructor: o.instructor, perDay: new Map() }
      byName.set(o.name, e)
    }
    if (!e.instructor && o.instructor) e.instructor = o.instructor
    e.perDay.set(o.day, (e.perDay.get(o.day) ?? 0) + o.periods)
  }
  return [...byName.entries()].map(([name, e]) => ({
    name,
    instructor: e.instructor,
    weekdays: [...e.perDay.keys()].sort(),
    hoursPerSession: Math.max(...e.perDay.values()),
  }))
}

function extractGrid(t: HwpxTable): ExtractedCourse[] {
  // 머리글에서 요일 열 범위
  const dayCols = t.cells
    .filter((c) => c.row === 0 && WEEKDAY_INDEX[c.text] !== undefined)
    .map((c) => ({ day: WEEKDAY_INDEX[c.text], from: c.col, to: c.col + c.colSpan - 1 }))
  // 첫 열에서 교시 행 범위
  const periodRows = t.cells
    .filter((c) => c.col === 0 && /^\d+$/.test(c.text))
    .map((c) => ({ from: c.row, to: c.row + c.rowSpan - 1 }))
  const headerBottom = Math.min(...periodRows.map((p) => p.from))

  const occurrences: { name: string; day: number; periods: number }[] = []
  for (const cell of t.cells) {
    if (cell.row < headerBottom) continue
    // 요일 범위의 첫 열(과목 열)만 강좌 셀로 본다. 옆 열은 학년·인원.
    const dc = dayCols.find((d) => d.from === cell.col)
    if (!dc) continue
    const name = courseName(cell.text)
    if (!name) continue
    const cellEnd = cell.row + cell.rowSpan - 1
    const periods = periodRows.filter((p) => !(cellEnd < p.from || cell.row > p.to)).length
    occurrences.push({ name, day: dc.day, periods: Math.max(periods, 1) })
  }
  return aggregate(occurrences)
}

/** 병합 정보를 펼쳐 완전한 2차원 표로 만든다 (목록형용 fill-down) */
function toMatrix(t: HwpxTable): string[][] {
  const mat: string[][] = Array.from({ length: t.rowCount }, () =>
    Array(t.colCount).fill(''),
  )
  for (const c of t.cells) {
    for (let r = c.row; r < c.row + c.rowSpan; r++) {
      for (let k = c.col; k < c.col + c.colSpan; k++) {
        if (r < t.rowCount && k < t.colCount && !mat[r][k]) mat[r][k] = c.text
      }
    }
  }
  return mat
}

function parseWeekdays(s: string): number[] {
  const cleaned = s.replace(/요일/g, '')
  const days = new Set<number>()
  for (const ch of cleaned) {
    if (WEEKDAY_INDEX[ch] !== undefined) days.add(WEEKDAY_INDEX[ch])
  }
  return [...days].sort()
}

function extractList(t: HwpxTable): ExtractedCourse[] {
  const mat = toMatrix(t)
  const header = mat[0]
  const findCol = (...kws: string[]) =>
    header.findIndex((h) => kws.some((k) => h.includes(k)))
  const nameCol = findCol('구분', '강좌', '프로그램', '과목')
  const instCol = findCol('강사')
  const dayCol = findCol('요일')
  if (nameCol < 0 || dayCol < 0) return []

  const occurrences: { name: string; instructor?: string; day: number; periods: number }[] = []
  for (let r = 1; r < mat.length; r++) {
    const name = courseName(mat[r][nameCol])
    if (!name) continue
    const days = parseWeekdays(mat[r][dayCol] ?? '')
    const instructor = instCol >= 0 ? mat[r][instCol]?.trim() || undefined : undefined
    // 한 행 = 하루 1교시 분량으로 계상 (같은 강좌가 여러 행이면 교시 수만큼 합산)
    for (const day of days) occurrences.push({ name, instructor, day, periods: 1 })
  }
  return aggregate(occurrences)
}

export function extractCourses(t: HwpxTable): ExtractedCourse[] {
  const shape = classifyTable(t)
  if (shape === 'grid') return extractGrid(t)
  if (shape === 'list') return extractList(t)
  return []
}

/** 시간표와 기존 강좌 목록(같은 구분끼리)을 대조한다 */
export interface CourseDiff {
  added: ExtractedCourse[]
  changed: { course: Course; next: ExtractedCourse; notes: string[] }[]
  missing: Course[]
}

export function diffCourses(extracted: ExtractedCourse[], existing: Course[]): CourseDiff {
  // 공백 차이("영어놀이 A" vs "영어놀이A")로 다른 강좌 취급하지 않도록 정규화해 대조
  const norm = (s: string) => s.replace(/\s+/g, '')
  const byName = new Map(existing.map((c) => [norm(c.name), c]))
  const added: ExtractedCourse[] = []
  const changed: CourseDiff['changed'] = []

  for (const e of extracted) {
    const cur = byName.get(norm(e.name))
    if (!cur) {
      added.push(e)
      continue
    }
    const notes: string[] = []
    if ([...cur.weekdays].sort().join(',') !== e.weekdays.join(',')) notes.push('요일')
    if (cur.hoursPerSession !== e.hoursPerSession) notes.push('시수')
    if (e.instructor && cur.instructor !== e.instructor) notes.push('강사')
    if (notes.length > 0) changed.push({ course: cur, next: e, notes })
  }
  const missing = existing.filter((c) => !extracted.some((e) => norm(e.name) === norm(c.name)))
  return { added, changed, missing }
}
