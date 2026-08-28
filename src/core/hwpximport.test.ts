import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  classifyTable,
  diffCourses,
  extractCourses,
  parseHwpxSection,
  type ExtractedCourse,
  type HwpxTable,
} from './hwpximport'
import type { Course } from './types'

let tables: HwpxTable[] = []

beforeAll(async () => {
  const buf = readFileSync(
    join(__dirname, '../../fixtures/2026학년도 1학기 시간표(방과후진로포함).hwpx'),
  )
  const zip = await JSZip.loadAsync(buf)
  const xml = await zip.file('Contents/section0.xml')!.async('string')
  tables = parseHwpxSection(xml)
})

describe('hwpx 시간표 파서 (실제 운영계획서 파일)', () => {
  it('표 2개를 찾고 형태를 구분한다: 격자형 + 목록형', () => {
    expect(tables.length).toBe(2)
    expect(classifyTable(tables[0])).toBe('grid')
    expect(classifyTable(tables[1])).toBe('list')
    expect(tables[0].heading).toContain('시간표')
  })

  describe('격자형 (교시×요일 주간 시간표)', () => {
    let courses: ExtractedCourse[] = []
    beforeAll(() => {
      courses = extractCourses(tables[0])
    })

    it('과목 셀에서 강좌를 추출한다', () => {
      const names = courses.map((c) => c.name)
      expect(names).toContain('토탈공예A')
      expect(names).toContain('창의코딩A')
      expect(names).toContain('풋살A')
      expect(names).toContain('컴퓨터자격A')
      expect(names).toContain('바이올린B')
    })

    it('정규수업·돌봄·인원·학년 셀은 강좌로 취급하지 않는다', () => {
      const names = courses.map((c) => c.name)
      expect(names.some((n) => n.includes('정규수업'))).toBe(false)
      expect(names.some((n) => n.includes('돌봄'))).toBe(false)
      expect(names.some((n) => /^\d/.test(n))).toBe(false)
    })

    it('요일과 교시 수를 정확히 매핑한다', () => {
      const find = (name: string) => courses.find((c) => c.name === name)!
      // 토탈공예A: 월 5교시 1회
      expect(find('토탈공예A').weekdays).toEqual([1])
      expect(find('토탈공예A').hoursPerSession).toBe(1)
      // 풋살A: 수 5교시
      expect(find('풋살A').weekdays).toEqual([3])
      // 컴퓨터자격A: 목 6교시
      expect(find('컴퓨터자격A').weekdays).toEqual([4])
      // 바이올린A: 금 6교시
      expect(find('바이올린A').weekdays).toEqual([5])
    })

    it("'예술아놀자C:오후돌봄' 같은 셀은 앞의 강좌명만 취한다", () => {
      const c = courses.find((x) => x.name === '예술아놀자C')
      expect(c).toBeDefined()
      expect(c!.weekdays).toEqual([2]) // 화 8교시
    })
  })

  describe('목록형 (진로교육 시간표)', () => {
    let courses: ExtractedCourse[] = []
    beforeAll(() => {
      courses = extractCourses(tables[1])
    })

    it('병합 셀을 채워 강좌별로 묶는다: 영어놀이A = 월·수 2교시', () => {
      expect(courses.length).toBe(2)
      const a = courses.find((c) => c.name === '영어놀이A')!
      expect(a.weekdays).toEqual([1, 3])
      expect(a.hoursPerSession).toBe(2)
      expect(a.instructor).toBeTruthy()
    })
  })
})

describe('현행화 대조 (diff)', () => {
  const existing = (over: Partial<Course>): Course => ({
    id: 'x',
    name: '영어놀이A',
    weekdays: [1, 3],
    hoursPerSession: 2,
    hourlyRate: 40000,
    startDate: '2026-03-02',
    endDate: '2026-07-17',
    ...over,
  })
  const extracted: ExtractedCourse[] = [
    { name: '영어놀이A', weekdays: [1, 3], hoursPerSession: 2 },
  ]

  it('일치하는 강좌는 신규·변경 어디에도 없다', () => {
    const d = diffCourses(extracted, [existing({})])
    expect(d.added).toEqual([])
    expect(d.changed).toEqual([])
    expect(d.missing).toEqual([])
  })

  it('요일·시수가 다르면 변경으로 잡는다', () => {
    const d = diffCourses(extracted, [existing({ weekdays: [1], hoursPerSession: 1 })])
    expect(d.changed.length).toBe(1)
    expect(d.changed[0].notes).toEqual(['요일', '시수'])
  })

  it('시간표에 없는 기존 강좌는 폐강 후보로만 표시한다', () => {
    const d = diffCourses(extracted, [existing({}), existing({ id: 'y', name: '없어진강좌' })])
    expect(d.missing.map((c) => c.name)).toEqual(['없어진강좌'])
  })

  it('시간표에만 있는 강좌는 신규로 잡는다', () => {
    const d = diffCourses(
      [...extracted, { name: '새강좌', weekdays: [2], hoursPerSession: 1 }],
      [existing({})],
    )
    expect(d.added.map((c) => c.name)).toEqual(['새강좌'])
  })
})
