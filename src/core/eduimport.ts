import type { CategoryKind } from './types'

/**
 * K-에듀파인 세출예산집행현황목록 파서.
 * 구조: 헤더 행(세부사업/세부항목/원가통계비목 | 산출내역 | 예산현액 | 원인행위액 | ...)
 * 아래로, 첫 열의 들여쓰기(공백 수)가 사업 계층을 나타내고
 * 산출내역이 채워진 행이 실제 예산 항목(잎)이다.
 */
export interface BudgetRow {
  /** 상위 계층 이름 (세부사업 > 세부항목) */
  path: string[]
  /** 원가통계비목 (운영수당, 교육운영비 등) */
  account: string
  /** 산출내역 */
  name: string
  /** 예산현액 */
  allocated: number
  /** 원인행위액 (집행 기준) */
  executed: number
  remaining: number
  /** 재매칭용 고유 키 (경로 + 목 + 산출내역) */
  key: string
}

function toWon(v: unknown): number {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? Math.round(n) : 0
}

/**
 * sheet_to_json(header: 1) 결과(2차원 배열)를 예산 항목 목록으로 변환한다.
 * 형식이 다르면 이유를 담은 Error를 던진다.
 */
export function parseBudgetRows(rows: unknown[][]): BudgetRow[] {
  const headerIdx = rows.findIndex((r) => r.some((c) => String(c).trim() === '산출내역'))
  if (headerIdx < 0) {
    throw new Error(
      "'산출내역' 열을 찾지 못했습니다. K-에듀파인의 세출예산집행현황목록 파일이 맞는지 확인하세요.",
    )
  }
  const header = rows[headerIdx].map((c) => String(c).trim())
  const colName = header.findIndex((h) => h === '산출내역')
  const colAlloc = header.findIndex((h) => h.startsWith('예산현액'))
  const colExec = header.findIndex((h) => h.startsWith('원인행위액') || h.startsWith('지출액'))
  const colRemain = header.findIndex((h) => h.startsWith('예산잔액'))
  if (colAlloc < 0 || colExec < 0) {
    throw new Error('예산현액 또는 원인행위액 열을 찾지 못했습니다.')
  }

  const stack: { indent: number; name: string }[] = []
  const out: BudgetRow[] = []

  for (const row of rows.slice(headerIdx + 1)) {
    const raw = String(row[0] ?? '')
    const label = raw.trim()
    if (!label) continue
    const indent = raw.length - raw.trimStart().length
    const name = String(row[colName] ?? '').trim()

    if (!name) {
      // 계층(그룹) 행. 합계는 건너뛴다.
      if (label.replace(/\s/g, '') === '합계') continue
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
      stack.push({ indent, name: label })
      continue
    }

    const path = stack.filter((g) => g.indent < indent).map((g) => g.name)
    const allocated = toWon(row[colAlloc])
    const executed = toWon(row[colExec])
    out.push({
      path,
      account: label,
      name,
      allocated,
      executed,
      remaining: colRemain >= 0 ? toWon(row[colRemain]) : allocated - executed,
      key: [...path, label, name].join(' > '),
    })
  }
  return out
}

/** 방과후 예산일 가능성이 높은 항목을 추려내는 키워드 */
export const RELEVANT_KEYWORDS = [
  '방과후',
  '강사',
  '특기적성',
  '자유수강권',
  '교통',
  '재료',
  '교구',
  '교재',
]

export function isRelevant(row: BudgetRow): boolean {
  const hay = [...row.path, row.account, row.name].join(' ')
  return RELEVANT_KEYWORDS.some((k) => hay.includes(k))
}

/** 산출내역 이름으로 유목을 추천한다. 담당자가 최종 확인·수정한다. */
export function suggestKind(row: BudgetRow): CategoryKind {
  const n = row.name
  if (n.includes('교통')) return 'travel'
  if (/부담금|보험/.test(n)) return 'etc'
  if (/재료|교구|교재/.test(n)) return 'material'
  if (n.includes('강사')) return 'lesson'
  return 'etc'
}
