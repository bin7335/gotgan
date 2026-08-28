import type { Budget, ClosedDay, Course, ISODate, Vacation } from './types'
import { WEEKDAY_LABELS, listDates, weekdayOf } from './date'

export interface CourseProjection {
  courseId: string
  name: string
  /** 회당 지급액 = 회당 시수 × 시간당 단가 (교통비 제외) */
  perSessionPay: number
  /** 기준일 이후 정규 수업일 수 (휴강 반영 전) */
  scheduled: number
  /** 휴강으로 빠진 회수 */
  closed: number
  /** 기준일 이후로 잡힌 보강 회수 */
  makeups: number
  /** 최종 남은 수업 횟수 n */
  sessions: number
  /** 최종 출강 날짜 (정규 + 보강, 오름차순) */
  sessionDates: ISODate[]
  /** n × 회당 지급액 */
  lessonCost: number
  /** 교통비 계상 일수 (강사 기준 중복 제거 후 이 강좌에 귀속된 일수) */
  travelDays: number
  travelCost: number
  total: number
}

/** 기간(학기중/방학)별 잔여 지출 분리 산출 */
export interface PeriodBreakdown {
  id: string
  name: string
  sessions: number
  lesson: number
  travel: number
  total: number
}

/** 교통비 지급 1건 (출강 1일, 중복 제거 후 귀속 강좌 기준) */
export interface TravelPayment {
  date: ISODate
  courseId: string
  amount: number
}

/** 월별 지급 예정 */
export interface MonthlyPlanRow {
  /** 'YYYY-MM' */
  month: string
  sessions: number
  lesson: number
  travel: number
  total: number
}

export interface Projection {
  baseDate: ISODate
  courses: CourseProjection[]
  /** 방학 기간이 등록된 경우 학기중 + 방학별 분리 내역 */
  periods: PeriodBreakdown[]
  /** 잔여 교통비 지급 내역 (날짜별) */
  travelPayments: TravelPayment[]
  lessonTotal: number
  travelTotal: number
  /** 잔여 예상 지출 F */
  remaining: number
  allocated: number
  executed: number
  /** 현재 잔액 R = 기정예산 − 집행액 */
  balance: number
  /** 추경 예상액 Δ = R − F. 양수면 반납 가능, 음수면 증액 필요. */
  delta: number
}

function appliesTo(closed: ClosedDay, courseId: string): boolean {
  return closed.scope === 'all' || closed.scope.includes(courseId)
}

/** 강좌의 정규 수업 날짜 전체 (운영 기간 내, 요일 일치) */
export function regularDates(course: Course): ISODate[] {
  if (course.startDate > course.endDate || course.weekdays.length === 0) return []
  const days = new Set(course.weekdays)
  return listDates(course.startDate, course.endDate).filter((d) => days.has(weekdayOf(d)))
}

/**
 * 기준일 이후 강좌별 잔여 출강 날짜를 계산한다.
 * - 정규 수업일: 기준일 당일 포함 (집행액은 "기준일 전날까지 지급분" 기준)
 * - 휴강: 해당 날짜의 정규 수업이 빠진다. 같은 날짜에 휴강이 중복 등록돼도 1회만 계상.
 * - 보강: 보강 날짜가 기준일 이후면 출강일에 추가된다.
 *   과거 수업의 휴강이라도 보강이 미래면 추가된다 (수업이 미래로 이동한 것).
 */
export function projectCourse(
  course: Course,
  closedDays: ClosedDay[],
  baseDate: ISODate,
): CourseProjection {
  const regular = regularDates(course)
  const regularSet = new Set(regular)
  const upcoming = new Set(regular.filter((d) => d >= baseDate))
  const scheduled = upcoming.size

  let closed = 0
  const makeupDates: ISODate[] = []
  const seenClosureDates = new Set<ISODate>()

  for (const c of closedDays) {
    if (!appliesTo(c, course.id)) continue
    if (!regularSet.has(c.date)) continue // 수업 없는 날의 휴강은 이 강좌와 무관
    if (seenClosureDates.has(c.date)) continue // 같은 날짜 중복 등록은 1회만
    seenClosureDates.add(c.date)

    if (upcoming.has(c.date)) {
      upcoming.delete(c.date)
      closed++
    }
    if (c.makeupDate && c.makeupDate >= baseDate) {
      makeupDates.push(c.makeupDate)
    }
  }

  const sessionDates = [...upcoming, ...makeupDates].sort()
  const sessions = sessionDates.length
  const perSessionPay = course.hoursPerSession * course.hourlyRate

  return {
    courseId: course.id,
    name: course.name,
    perSessionPay,
    scheduled,
    closed,
    makeups: makeupDates.length,
    sessions,
    sessionDates,
    lessonCost: sessions * perSessionPay,
    travelDays: 0,
    travelCost: 0,
    total: sessions * perSessionPay,
  }
}

/**
 * 전체 산출. 교통비는 출강 1일당 1회 계상하되,
 * 같은 강사(강사명 기준)가 같은 날 복수 강좌에 출강하면 1회만 —
 * 금액이 다르면 큰 쪽을 지급하고 해당 강좌에 귀속시킨다.
 * 강사명이 없는 강좌는 강좌 단위로 독립 계상한다.
 */
export function projectAll(
  courses: Course[],
  closedDays: ClosedDay[],
  budget: Budget,
  baseDate: ISODate,
  vacations: Vacation[] = [],
): Projection {
  const projections = courses.map((c) => projectCourse(c, closedDays, baseDate))

  // (강사 키, 날짜)별로 교통비 후보 중 최대 금액 강좌 하나에만 지급
  const byInstructorDay = new Map<string, { index: number; amount: number }>()
  courses.forEach((course, index) => {
    const amount = course.travelPerDay ?? 0
    if (amount <= 0) return
    const instructorKey = course.instructor?.trim() || `#course:${course.id}`
    for (const date of new Set(projections[index].sessionDates)) {
      const key = `${instructorKey}|${date}`
      const prev = byInstructorDay.get(key)
      if (!prev || amount > prev.amount) byInstructorDay.set(key, { index, amount })
    }
  })
  for (const { index, amount } of byInstructorDay.values()) {
    projections[index].travelDays++
    projections[index].travelCost += amount
  }
  for (const p of projections) p.total = p.lessonCost + p.travelCost

  const travelPayments: TravelPayment[] = [...byInstructorDay.entries()]
    .map(([key, { index, amount }]) => ({
      date: key.slice(key.lastIndexOf('|') + 1),
      courseId: courses[index].id,
      amount,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  const lessonTotal = projections.reduce((s, p) => s + p.lessonCost, 0)
  const travelTotal = projections.reduce((s, p) => s + p.travelCost, 0)
  const remaining = lessonTotal + travelTotal
  const balance = budget.allocated - budget.executed

  // 기간별(학기중/방학) 분리 산출
  let periods: PeriodBreakdown[] = []
  if (vacations.length > 0) {
    const sorted = [...vacations].sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
    const bucketOf = (d: ISODate): string =>
      sorted.find((v) => v.startDate <= d && d <= v.endDate)?.id ?? 'term'
    const buckets = new Map<string, PeriodBreakdown>([
      ['term', { id: 'term', name: '학기중', sessions: 0, lesson: 0, travel: 0, total: 0 }],
      ...sorted.map(
        (v) =>
          [v.id, { id: v.id, name: v.name, sessions: 0, lesson: 0, travel: 0, total: 0 }] as const,
      ),
    ])
    projections.forEach((p) => {
      for (const d of p.sessionDates) {
        const b = buckets.get(bucketOf(d))!
        b.sessions++
        b.lesson += p.perSessionPay
      }
    })
    for (const [key, { amount }] of byInstructorDay) {
      const date = key.slice(key.lastIndexOf('|') + 1)
      buckets.get(bucketOf(date))!.travel += amount
    }
    for (const b of buckets.values()) b.total = b.lesson + b.travel
    periods = [...buckets.values()].filter((b) => b.sessions > 0 || b.travel > 0)
  }

  return {
    baseDate,
    courses: projections,
    periods,
    travelPayments,
    lessonTotal,
    travelTotal,
    remaining,
    allocated: budget.allocated,
    executed: budget.executed,
    balance,
    delta: balance - remaining,
  }
}

/** 잔여 지출을 월별로 묶는다 — 월별 지급품의 금액 미리보기용 */
export function monthlyPlan(projection: Projection): MonthlyPlanRow[] {
  const map = new Map<string, MonthlyPlanRow>()
  const get = (month: string): MonthlyPlanRow => {
    let row = map.get(month)
    if (!row) {
      row = { month, sessions: 0, lesson: 0, travel: 0, total: 0 }
      map.set(month, row)
    }
    return row
  }
  for (const p of projection.courses) {
    for (const d of p.sessionDates) {
      const row = get(d.slice(0, 7))
      row.sessions++
      row.lesson += p.perSessionPay
    }
  }
  for (const t of projection.travelPayments) {
    get(t.date.slice(0, 7)).travel += t.amount
  }
  const rows = [...map.values()].sort((a, b) => (a.month < b.month ? -1 : 1))
  for (const r of rows) r.total = r.lesson + r.travel
  return rows
}

/** 보강일이 다른 휴강일·정규 수업일과 겹치는 등 확인이 필요한 상황을 찾아낸다. */
export function collectWarnings(courses: Course[], closedDays: ClosedDay[]): string[] {
  const warnings: string[] = []
  const courseById = new Map(courses.map((c) => [c.id, c]))

  for (const c of closedDays) {
    if (!c.makeupDate) continue
    const affected =
      c.scope === 'all' ? courses : c.scope.map((id) => courseById.get(id)).filter((x) => !!x)

    for (const course of affected) {
      const conflict = closedDays.find(
        (other) => other.id !== c.id && other.date === c.makeupDate && appliesTo(other, course.id),
      )
      if (conflict) {
        warnings.push(
          `[${course.name}] ${c.date} 휴강의 보강일(${c.makeupDate})이 휴강일(${conflict.reason})과 겹칩니다.`,
        )
      }
      if (regularDates(course).includes(c.makeupDate)) {
        warnings.push(
          `[${course.name}] ${c.date} 휴강의 보강일(${c.makeupDate})이 정규 수업일과 겹칩니다. 같은 날 2회 수업이 맞는지 확인하세요.`,
        )
      }
    }
  }
  return warnings
}

export function formatWon(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`
}

export function weekdaysLabel(weekdays: number[]): string {
  return [...weekdays].sort().map((w) => WEEKDAY_LABELS[w]).join('·')
}
