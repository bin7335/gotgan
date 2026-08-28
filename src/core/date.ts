import type { ISODate } from './types'

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const

/** ISODate → UTC 자정 Date. 로컬 타임존의 영향을 받지 않는다. */
export function toUTC(d: ISODate): Date {
  const [y, m, dd] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, dd))
}

export function fromUTC(dt: Date): ISODate {
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 0=일 ~ 6=토 */
export function weekdayOf(d: ISODate): number {
  return toUTC(d).getUTCDay()
}

export function addDays(d: ISODate, n: number): ISODate {
  const dt = toUTC(d)
  dt.setUTCDate(dt.getUTCDate() + n)
  return fromUTC(dt)
}

/** [start, end] 구간의 모든 날짜 (양끝 포함) */
export function listDates(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

/** 오늘 날짜 (Asia/Seoul 고정) */
export function todayISO(): ISODate {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

export function isValidISODate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  return fromUTC(toUTC(d)) === d
}
