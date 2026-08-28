/** 'YYYY-MM-DD' 형식의 날짜 문자열. 사전순 비교가 곧 날짜 비교가 된다. */
export type ISODate = string

export interface Course {
  id: string
  name: string
  /** 강사명 (선택). 교통비 1일 1회 중복 제거의 기준. */
  instructor?: string
  /** 학기중 / 여름방학 / 겨울방학 구분 (기본 'term'). 화면 분류용 — 계산은 날짜 기준. */
  program?: 'term' | Season
  /** 수업 요일 (0=일 ~ 6=토, 복수 선택) */
  weekdays: number[]
  /** 회당 시수 */
  hoursPerSession: number
  /** 시간당 단가 (기본 40,000원) */
  hourlyRate: number
  /** 출강 1일당 교통비 (선택) */
  travelPerDay?: number
  startDate: ISODate
  endDate: ISODate
}

export interface ClosedDay {
  id: string
  date: ISODate
  reason: string
  /** 'all' = 전체 강좌 휴강, 배열 = 해당 강좌만 휴강 */
  scope: 'all' | string[]
  /** 보강 날짜 (선택). 지정하면 해당 회차는 지출 감소에서 제외된다. */
  makeupDate?: ISODate
}

export type Season = 'summer' | 'winter'

export const SEASON_LABELS: Record<Season, string> = {
  summer: '여름방학',
  winter: '겨울방학',
}

/** 방학 기간. 이 기간에 속한 수업은 기간별로 분리 산출된다. */
export interface Vacation {
  id: string
  name: string
  season: Season
  startDate: ISODate
  endDate: ISODate
}

export interface Budget {
  /** 기정예산 (본예산 + 기존 추경 반영액) */
  allocated: number
  /** 기준일 전날까지 지급 완료된 강사비 누계 */
  executed: number
}

/** 예산 유목: 강사비/교통비는 자동 산출과 연결, 재료비/기타는 수동 예상 지출 */
export type CategoryKind = 'lesson' | 'travel' | 'material' | 'etc'

export const CATEGORY_LABELS: Record<CategoryKind, string> = {
  lesson: '강사비',
  travel: '교통비',
  material: '재료비',
  etc: '기타',
}

export interface BudgetCategory {
  kind: CategoryKind
  /** 선택한 산출내역들의 예산현액 합계 */
  allocated: number
  /** 선택한 산출내역들의 원인행위액 합계 */
  executed: number
  /** 재료비·기타의 잔여 예상 지출 (수동 입력) */
  manualRemaining?: number
}

/** 엑셀에서 가져온 산출내역 1건 — 산출내역별 추경 예상의 단위 */
export interface BudgetLine {
  /** 사업 경로 + 목 + 산출내역으로 만든 고유 키 */
  key: string
  name: string
  kind: CategoryKind
  allocated: number
  executed: number
}

/** 엑셀 가져오기에서 선택한 항목 기억 — 다음 업로드 때 자동 재매칭 */
export interface ImportMemo {
  fileName: string
  importedAt: string
  selections: { key: string; name: string; kind: CategoryKind }[]
}

export interface Settings {
  schoolName?: string
  semesterLabel?: string
  /** 내장 공휴일을 자동 휴강 처리할지 */
  autoHolidays: boolean
  /** 자동 휴강에서 개별 해제한 공휴일 */
  disabledHolidays: ISODate[]
}

export interface AppState {
  version: 1
  budget: Budget
  courses: Course[]
  closedDays: ClosedDay[]
  vacations: Vacation[]
  settings: Settings
  /** 계산 기준일. 비우면 오늘(Asia/Seoul). */
  baseDate?: ISODate
  /** 엑셀 가져오기로 만든 유목별 예산 (선택 기능) */
  categories?: BudgetCategory[]
  /** 엑셀에서 가져온 산출내역 목록 — 산출내역별 추경 예상에 사용 */
  budgetLines?: BudgetLine[]
  /** 산출내역 키 → 연결된 강좌 id 목록 (같은 유목의 산출내역이 여러 개일 때) */
  lineAssignments?: Record<string, string[]>
  /** 재료비·기타 산출내역별 잔여 예상 지출 (수동 입력) */
  lineManuals?: Record<string, number>
  importMemo?: ImportMemo
  /** 절차형 초기 설정을 마쳤는지. false면 설정 마법사가 표시된다. */
  setupDone?: boolean
}

export const DEFAULT_HOURLY_RATE = 40000
