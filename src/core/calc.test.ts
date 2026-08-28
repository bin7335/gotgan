import { describe, expect, it } from 'vitest'
import { collectWarnings, monthlyPlan, projectAll, projectCourse, regularDates } from './calc'
import { holidayClosures } from './holidays'
import type { ClosedDay, Course } from './types'

// PRD 5장 검증용 시나리오의 강좌: 매주 월·수, 회당 2시간 × 40,000원, 9/1~12/17
const coding: Course = {
  id: 'coding',
  name: '코딩교실',
  weekdays: [1, 3],
  hoursPerSession: 2,
  hourlyRate: 40000,
  startDate: '2026-09-01',
  endDate: '2026-12-17',
}

const closure = (partial: Partial<ClosedDay> & { date: string }): ClosedDay => ({
  id: `c-${partial.date}-${partial.reason ?? ''}`,
  reason: '행사',
  scope: 'all',
  ...partial,
})

describe('PRD 계산 예시 (5장)', () => {
  const closedDays = [
    closure({ date: '2026-10-28', reason: '현장체험학습' }),
    closure({ date: '2026-12-09', reason: '학예회' }),
  ]

  it('기준일 10/15 이후 월·수 정규 수업일은 18회', () => {
    const p = projectCourse(coding, [], '2026-10-15')
    expect(p.scheduled).toBe(18)
    expect(p.sessions).toBe(18)
  })

  it('휴강 2회 반영 시 16회, 잔여 지출 1,280,000원', () => {
    const p = projectCourse(coding, closedDays, '2026-10-15')
    expect(p.closed).toBe(2)
    expect(p.sessions).toBe(16)
    expect(p.perSessionPay).toBe(80000)
    expect(p.lessonCost).toBe(1_280_000)
  })

  it('추경 예상액 Δ = 1,600,000 − 1,280,000 = 320,000원 반납', () => {
    const result = projectAll(
      [coding],
      closedDays,
      { allocated: 4_000_000, executed: 2_400_000 },
      '2026-10-15',
    )
    expect(result.remaining).toBe(1_280_000)
    expect(result.balance).toBe(1_600_000)
    expect(result.delta).toBe(320_000)
  })
})

describe('기간 경계', () => {
  it('기준일 당일이 수업일이면 잔여에 포함된다', () => {
    // 2026-10-19는 월요일
    const p = projectCourse(coding, [], '2026-10-19')
    expect(p.sessionDates[0]).toBe('2026-10-19')
  })

  it('시작일·종료일 당일 수업이 포함된다', () => {
    // 시작 2026-09-01은 화요일이라 미포함, 종료 2026-12-17은 목요일이라 미포함
    // 요일을 화·목으로 바꾸면 양끝이 모두 수업일
    const c: Course = { ...coding, weekdays: [2, 4] }
    const dates = regularDates(c)
    expect(dates[0]).toBe('2026-09-01')
    expect(dates[dates.length - 1]).toBe('2026-12-17')
  })

  it('종료일이 기준일 이전이면 잔여 0', () => {
    const p = projectCourse(coding, [], '2026-12-18')
    expect(p.sessions).toBe(0)
    expect(p.lessonCost).toBe(0)
  })
})

describe('휴강·보강 규칙', () => {
  it('보강이 잡힌 휴강은 지출이 줄지 않는다', () => {
    const p = projectCourse(
      coding,
      [closure({ date: '2026-10-28', makeupDate: '2026-10-30' })],
      '2026-10-15',
    )
    expect(p.closed).toBe(1)
    expect(p.makeups).toBe(1)
    expect(p.sessions).toBe(18)
    expect(p.sessionDates).toContain('2026-10-30')
  })

  it('과거 수업의 휴강이라도 보강이 미래면 잔여에 추가된다', () => {
    // 2026-10-07(수)은 기준일 10/15 이전
    const p = projectCourse(
      coding,
      [closure({ date: '2026-10-07', makeupDate: '2026-11-06' })],
      '2026-10-15',
    )
    expect(p.sessions).toBe(19)
  })

  it('같은 날짜에 휴강이 중복 등록돼도 1회만 계상한다', () => {
    const p = projectCourse(
      coding,
      [closure({ date: '2026-10-28', reason: 'A' }), closure({ date: '2026-10-28', reason: 'B' })],
      '2026-10-15',
    )
    expect(p.closed).toBe(1)
    expect(p.sessions).toBe(17)
  })

  it('수업 없는 요일의 휴강은 영향이 없다', () => {
    // 2026-10-29는 목요일
    const p = projectCourse(coding, [closure({ date: '2026-10-29' })], '2026-10-15')
    expect(p.sessions).toBe(18)
  })

  it('다른 강좌만 지정한 휴강은 영향이 없다', () => {
    const p = projectCourse(
      coding,
      [closure({ date: '2026-10-28', scope: ['other-course'] })],
      '2026-10-15',
    )
    expect(p.sessions).toBe(18)
  })

  it('보강일이 다른 휴강일과 겹치면 경고한다', () => {
    const warnings = collectWarnings(
      [coding],
      [
        closure({ date: '2026-10-28', reason: '체험학습', makeupDate: '2026-12-09' }),
        closure({ date: '2026-12-09', reason: '학예회' }),
      ],
    )
    expect(warnings.some((w) => w.includes('겹칩니다'))).toBe(true)
  })
})

describe('교통비 (출강 1일당)', () => {
  it('교통비는 출강일 수만큼 계상된다', () => {
    const c: Course = { ...coding, travelPerDay: 5000 }
    const result = projectAll([c], [], { allocated: 0, executed: 0 }, '2026-10-15')
    expect(result.courses[0].travelDays).toBe(18)
    expect(result.courses[0].travelCost).toBe(90_000)
    expect(result.remaining).toBe(18 * 80_000 + 90_000)
  })

  it('같은 강사가 같은 날 복수 강좌 출강 시 1회만, 큰 금액으로 계상한다', () => {
    const a: Course = { ...coding, id: 'a', instructor: '김강사', travelPerDay: 10_000 }
    const b: Course = { ...coding, id: 'b', instructor: '김강사', travelPerDay: 12_000 }
    const result = projectAll([a, b], [], { allocated: 0, executed: 0 }, '2026-10-15')
    expect(result.travelTotal).toBe(18 * 12_000)
  })

  it('강사가 다르면 각각 계상한다', () => {
    const a: Course = { ...coding, id: 'a', instructor: '김강사', travelPerDay: 10_000 }
    const b: Course = { ...coding, id: 'b', instructor: '이강사', travelPerDay: 10_000 }
    const result = projectAll([a, b], [], { allocated: 0, executed: 0 }, '2026-10-15')
    expect(result.travelTotal).toBe(18 * 20_000)
  })

  it('휴강으로 소멸한 날에는 교통비가 나가지 않는다', () => {
    const c: Course = { ...coding, travelPerDay: 5000 }
    const result = projectAll(
      [c],
      [closure({ date: '2026-10-28' })],
      { allocated: 0, executed: 0 },
      '2026-10-15',
    )
    expect(result.courses[0].travelDays).toBe(17)
  })
})

describe('공휴일 자동 휴강', () => {
  it('내장 공휴일이 수업일과 겹치면 자동으로 빠진다', () => {
    // 2026-10-05(월)은 개천절 대체공휴일, 2026-10-09(금)는 한글날
    const c: Course = { ...coding, startDate: '2026-10-01', endDate: '2026-10-31' }
    const withHolidays = projectCourse(c, holidayClosures([]), '2026-10-01')
    const without = projectCourse(c, [], '2026-10-01')
    expect(without.sessions - withHolidays.sessions).toBe(1) // 10/5 월요일 1회
  })

  it('해제한 공휴일은 다시 수업일로 계상된다', () => {
    const c: Course = { ...coding, startDate: '2026-10-01', endDate: '2026-10-31' }
    const p = projectCourse(c, holidayClosures(['2026-10-05']), '2026-10-01')
    const without = projectCourse(c, [], '2026-10-01')
    expect(p.sessions).toBe(without.sessions)
  })
})

describe('방학 기간 분리 산출', () => {
  const vacation = {
    id: 'winter',
    name: '겨울방학',
    season: 'winter' as const,
    startDate: '2026-12-01',
    endDate: '2027-02-28',
  }

  it('방학 기간에 속한 수업이 별도 구간으로 집계된다', () => {
    const result = projectAll([coding], [], { allocated: 0, executed: 0 }, '2026-10-15', [vacation])
    // 12/1~12/17 사이 월·수: 12/2, 7, 9, 14, 16 = 5회
    const winter = result.periods.find((p) => p.id === 'winter')!
    const term = result.periods.find((p) => p.id === 'term')!
    expect(winter.sessions).toBe(5)
    expect(winter.lesson).toBe(5 * 80_000)
    expect(term.sessions).toBe(13)
    expect(term.lesson + winter.lesson).toBe(result.lessonTotal)
  })

  it('교통비도 날짜 기준으로 구간에 배분된다', () => {
    const c: Course = { ...coding, travelPerDay: 5000 }
    const result = projectAll([c], [], { allocated: 0, executed: 0 }, '2026-10-15', [vacation])
    const winter = result.periods.find((p) => p.id === 'winter')!
    expect(winter.travel).toBe(5 * 5000)
    expect(result.periods.reduce((s, p) => s + p.travel, 0)).toBe(result.travelTotal)
  })

  it('방학이 없으면 periods는 비어 있다', () => {
    const result = projectAll([coding], [], { allocated: 0, executed: 0 }, '2026-10-15')
    expect(result.periods).toEqual([])
  })
})

describe('월별 지급 예정', () => {
  it('잔여 수업이 월별로 묶이고 합계가 총 잔여 지출과 일치한다', () => {
    const c: Course = { ...coding, travelPerDay: 5000 }
    const result = projectAll([c], [], { allocated: 0, executed: 0 }, '2026-10-15')
    const plan = monthlyPlan(result)
    expect(plan.map((r) => r.month)).toEqual(['2026-10', '2026-11', '2026-12'])
    // 10/15 이후 월·수: 10월 19,21,26,28 = 4회
    expect(plan[0].sessions).toBe(4)
    expect(plan[0].lesson).toBe(4 * 80_000)
    expect(plan[0].travel).toBe(4 * 5000)
    expect(plan.reduce((s, r) => s + r.total, 0)).toBe(result.remaining)
  })

  it('교통비 지급 내역 합계가 교통비 총액과 일치한다', () => {
    const a: Course = { ...coding, id: 'a', instructor: '김강사', travelPerDay: 10_000 }
    const b: Course = { ...coding, id: 'b', instructor: '김강사', travelPerDay: 12_000 }
    const result = projectAll([a, b], [], { allocated: 0, executed: 0 }, '2026-10-15')
    expect(result.travelPayments.reduce((s, t) => s + t.amount, 0)).toBe(result.travelTotal)
    // 중복 제거: 같은 날 지급 1건씩
    expect(result.travelPayments.length).toBe(18)
  })
})

describe('추경 방향', () => {
  it('잔액이 잔여 지출보다 작으면 Δ가 음수(증액 필요)', () => {
    const result = projectAll(
      [coding],
      [],
      { allocated: 3_000_000, executed: 2_400_000 },
      '2026-10-15',
    )
    // 잔여 18회 × 80,000 = 1,440,000 > 잔액 600,000
    expect(result.delta).toBe(-840_000)
  })
})
