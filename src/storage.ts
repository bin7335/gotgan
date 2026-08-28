import type { AppState, Course, Vacation } from './core/types'

const KEY = 'gotgan:v1'

export function defaultState(): AppState {
  return {
    version: 1,
    budget: { allocated: 0, executed: 0 },
    courses: [],
    closedDays: [],
    vacations: [],
    settings: { autoHolidays: true, disabledHolidays: [] },
    setupDone: false,
  }
}

function normalize(raw: unknown): AppState {
  const base = defaultState()
  if (typeof raw !== 'object' || raw === null) return base
  const s = raw as Partial<AppState>
  if (s.version !== 1 || !Array.isArray(s.courses) || !Array.isArray(s.closedDays)) return base
  // 이전 버전 데이터 이행: program 'vacation' → 계절 구분, Vacation.season 보강
  const courses = (s.courses as Course[]).map((c) => {
    const legacy = c.program as string | undefined
    if (legacy !== 'vacation') return c
    return { ...c, program: c.startDate.slice(5, 7) >= '06' && c.startDate.slice(5, 7) <= '08' ? 'summer' : 'winter' } as Course
  })
  const vacations = (Array.isArray(s.vacations) ? s.vacations : []).map((v: Vacation) => ({
    ...v,
    season: v.season ?? (String(v.name).includes('여름') ? 'summer' : 'winter'),
  }))
  return {
    ...base,
    ...s,
    version: 1,
    budget: { ...base.budget, ...s.budget },
    courses,
    vacations,
    settings: { ...base.settings, ...s.settings },
    // 마법사 도입 전에 만든 데이터는 설정 완료로 취급
    setupDone: typeof s.setupDone === 'boolean' ? s.setupDone : courses.length > 0,
  }
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultState()
    return normalize(JSON.parse(raw))
  } catch {
    return defaultState()
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // 저장 실패(시크릿 모드 등)해도 앱 동작은 계속한다
  }
}

export function exportJSON(state: AppState): string {
  return JSON.stringify(state, null, 2)
}

/** 백업 JSON을 검증하며 불러온다. 형식이 다르면 throw. */
export function parseImported(text: string): AppState {
  const parsed = JSON.parse(text) as Partial<AppState>
  if (parsed?.version !== 1 || !Array.isArray(parsed.courses)) {
    throw new Error('방과후 곳간 백업 파일이 아닙니다.')
  }
  return normalize(parsed)
}

/** 첫 사용자용 예시 데이터 (PRD 5장 검증 시나리오 기반) */
export function sampleState(): AppState {
  const lineLesson =
    '학생복지운영 > [초]통폐합기금(방과후학교운영) > 운영수당 > 방과후학교강사료'
  const lineTravel =
    '학생복지운영 > [초]통폐합기금(방과후학교운영) > 운영수당 > 방과후학교강사교통비'
  const lineMaterial =
    '학생복지운영 > [초]통폐합기금(방과후학교운영) > 교육운영비 > 방과후학교학습재료구입'
  return {
    version: 1,
    // 히어로 예산 = 강사비 + 교통비 산출내역 합계
    budget: { allocated: 13_000_000, executed: 4_300_000 },
    courses: [
      {
        id: 'sample-coding',
        name: '코딩교실',
        weekdays: [1, 3],
        hoursPerSession: 2,
        hourlyRate: 40000,
        startDate: '2026-09-01',
        endDate: '2026-12-16',
      },
      {
        id: 'sample-dance',
        name: '방송댄스',
        instructor: '외부강사A',
        weekdays: [2, 4],
        hoursPerSession: 1,
        hourlyRate: 40000,
        travelPerDay: 10000,
        startDate: '2026-09-01',
        endDate: '2026-12-17',
      },
      {
        id: 'sample-camp',
        name: '방학 코딩캠프',
        program: 'winter',
        weekdays: [1, 2, 3, 4, 5],
        hoursPerSession: 2,
        hourlyRate: 40000,
        startDate: '2027-01-04',
        endDate: '2027-01-15',
      },
    ],
    closedDays: [
      {
        id: 'sample-closed-1',
        date: '2026-10-28',
        reason: '현장체험학습',
        scope: 'all',
      },
    ],
    vacations: [
      {
        id: 'sample-vacation-1',
        name: '겨울방학',
        season: 'winter',
        startDate: '2026-12-24',
        endDate: '2027-02-28',
      },
    ],
    settings: { semesterLabel: '2026학년도 2학기', autoHolidays: true, disabledHolidays: [] },
    categories: [
      { kind: 'lesson', allocated: 12_000_000, executed: 4_000_000 },
      { kind: 'travel', allocated: 1_000_000, executed: 300_000 },
      { kind: 'material', allocated: 8_000_000, executed: 300_000, manualRemaining: 5_000_000 },
    ],
    budgetLines: [
      {
        key: lineLesson,
        name: '방과후학교강사료',
        kind: 'lesson',
        allocated: 12_000_000,
        executed: 4_000_000,
      },
      {
        key: lineTravel,
        name: '방과후학교강사교통비',
        kind: 'travel',
        allocated: 1_000_000,
        executed: 300_000,
      },
      {
        key: lineMaterial,
        name: '방과후학교학습재료구입',
        kind: 'material',
        allocated: 8_000_000,
        executed: 300_000,
      },
    ],
    lineManuals: { [lineMaterial]: 5_000_000 },
    importMemo: {
      fileName: '세출예산집행현황목록.xls',
      importedAt: '2026-08-28',
      selections: [
        { key: lineLesson, name: '방과후학교강사료', kind: 'lesson' },
        { key: lineTravel, name: '방과후학교강사교통비', kind: 'travel' },
        { key: lineMaterial, name: '방과후학교학습재료구입', kind: 'material' },
      ],
    },
    setupDone: true,
  }
}
