import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { isRelevant, parseBudgetRows, suggestKind, type BudgetRow } from './eduimport'

function loadSample(): BudgetRow[] {
  const buf = readFileSync(join(__dirname, '../../fixtures/세출예산집행현황목록.xls'))
  const wb = XLSX.read(buf, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
  return parseBudgetRows(rows)
}

describe('세출예산집행현황 파서 (실제 샘플 파일)', () => {
  const rows = loadSample()

  it('산출내역이 있는 잎 행만 항목으로 추출한다', () => {
    expect(rows.length).toBeGreaterThan(40)
    expect(rows.every((r) => r.name.length > 0)).toBe(true)
  })

  it('금액과 계층 경로를 정확히 읽는다 — 방과후학교강사료', () => {
    const row = rows.find((r) => r.name === '방과후학교강사료')!
    expect(row.allocated).toBe(12_950_000)
    expect(row.executed).toBe(4_640_000)
    expect(row.remaining).toBe(8_310_000)
    expect(row.account).toBe('운영수당')
    expect(row.path).toEqual(['학생복지운영', '[초]통폐합기금(방과후학교운영)'])
  })

  it('같은 이름의 산출내역이 다른 사업에 있어도 키가 다르다', () => {
    const same = rows.filter((r) => r.name === '[목]강사료')
    expect(same.length).toBeGreaterThanOrEqual(2)
    expect(new Set(same.map((r) => r.key)).size).toBe(same.length)
  })

  it('합계·그룹 행은 항목에 포함되지 않는다', () => {
    expect(rows.some((r) => r.name.replace(/\s/g, '') === '합계')).toBe(false)
    expect(rows.some((r) => r.account.includes('학생복지운영'))).toBe(false)
  })

  it('키워드 필터가 방과후 관련 항목을 추려낸다', () => {
    const relevant = rows.filter(isRelevant)
    expect(relevant.some((r) => r.name === '방과후학교강사료')).toBe(true)
    expect(relevant.some((r) => r.name === '방과후학교강사교통비')).toBe(true)
    expect(relevant.some((r) => r.name === '방과후학교학습재료구입')).toBe(true)
    // 행정실 운영비 같은 무관 항목은 걸리지 않는다
    expect(relevant.some((r) => r.name === '복사기렌탈료')).toBe(false)
  })

  it('유목 추천: 교통 → travel, 재료 → material, 강사료 → lesson, 부담금 → etc', () => {
    const kindOf = (name: string) => suggestKind(rows.find((r) => r.name === name)!)
    expect(kindOf('방과후학교강사교통비')).toBe('travel')
    expect(kindOf('방과후학교학습재료구입')).toBe('material')
    expect(kindOf('방과후학교강사료')).toBe('lesson')
    // '강사'가 들어가도 부담금은 강사비로 추천하지 않는다
    expect(kindOf('방과후학교강사기관부담금')).toBe('etc')
  })
})

describe('파서 오류 처리', () => {
  it('산출내역 열이 없으면 안내 메시지와 함께 실패한다', () => {
    expect(() => parseBudgetRows([['아무', '관계없는', '표']])).toThrow('산출내역')
  })
})
