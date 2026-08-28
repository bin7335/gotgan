import { formatWon, weekdaysLabel, type Projection } from '../core/calc'
import { WEEKDAY_LABELS, todayISO, weekdayOf } from '../core/date'
import { KR_HOLIDAYS } from '../core/holidays'
import { SEASON_LABELS, type AppState, type ISODate } from '../core/types'

function dayLabel(d: ISODate): string {
  return `${d} (${WEEKDAY_LABELS[weekdayOf(d)]})`
}

export function Report({
  state,
  projection,
  baseDate,
}: {
  state: AppState
  projection: Projection
  baseDate: ISODate
}) {
  const { allocated, executed, balance, remaining, delta, lessonTotal, travelTotal } = projection
  const courseById = new Map(state.courses.map((c) => [c.id, c]))
  const title = [state.settings.schoolName, state.settings.semesterLabel, '방과후학교 강사비 예산 산출 내역']
    .filter(Boolean)
    .join(' ')

  // 수업에 실제로 영향을 준 휴강만 근거 자료에 싣는다
  const affects = (date: ISODate, scope: 'all' | string[]): string[] =>
    state.courses
      .filter(
        (c) =>
          (scope === 'all' || scope.includes(c.id)) &&
          c.startDate <= date &&
          date <= c.endDate &&
          c.weekdays.includes(weekdayOf(date)),
      )
      .map((c) => c.name)

  const closureRows = [
    ...state.closedDays.map((c) => ({
      date: c.date,
      reason: c.reason,
      makeup: c.makeupDate,
      names: affects(c.date, c.scope),
    })),
    ...(state.settings.autoHolidays
      ? Object.entries(KR_HOLIDAYS)
          .filter(([d]) => !state.settings.disabledHolidays.includes(d))
          .map(([d, name]) => ({
            date: d,
            reason: `공휴일(${name})`,
            makeup: undefined as ISODate | undefined,
            names: affects(d, 'all'),
          }))
      : []),
  ]
    .filter((r) => r.names.length > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  const downloadCSV = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const lines: string[] = []
    lines.push(['강좌명', '구분', '강사명', '요일', '회당 지급액', '정규', '휴강', '보강', '남은 횟수', '교통비', '잔여 지출'].map(esc).join(','))
    for (const p of projection.courses) {
      const c = courseById.get(p.courseId)
      lines.push(
        [
          p.name,
          c?.program && c.program !== 'term' ? SEASON_LABELS[c.program] : '학기중',
          c?.instructor ?? '',
          c ? weekdaysLabel(c.weekdays) : '',
          p.perSessionPay,
          p.scheduled,
          p.closed,
          p.makeups,
          p.sessions,
          p.travelCost,
          p.total,
        ]
          .map(esc)
          .join(','),
      )
    }
    lines.push('')
    lines.push([esc('기준일'), esc(baseDate)].join(','))
    lines.push([esc('기정예산'), esc(allocated)].join(','))
    lines.push([esc('집행액'), esc(executed)].join(','))
    lines.push([esc('현재 잔액'), esc(balance)].join(','))
    lines.push([esc('잔여 예상 지출'), esc(remaining)].join(','))
    lines.push([esc(delta >= 0 ? '반납(감액) 예상액' : '증액 필요액'), esc(Math.abs(delta))].join(','))
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `방과후_예산산출_${baseDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="stack report">
      <div className="row no-print">
        <button className="btn primary" onClick={() => window.print()}>
          인쇄 / PDF 저장
        </button>
        <button className="btn" onClick={downloadCSV}>
          CSV 내려받기
        </button>
      </div>

      <section className="card print-sheet">
        <h2 className="report-title">{title}</h2>
        <p className="muted small-text">
          기준일 {dayLabel(baseDate)} · 집행액은 기준일 전날까지 지급 완료된 금액 기준 · 출력일{' '}
          {todayISO()}
        </p>

        <h3>1. 예산 총괄</h3>
        <div className="tablewrap">
          <table className="data">
            <tbody>
              <tr>
                <td>기정예산 (B)</td>
                <td className="num">{formatWon(allocated)}</td>
              </tr>
              <tr>
                <td>집행액 (E)</td>
                <td className="num">{formatWon(executed)}</td>
              </tr>
              <tr>
                <td>현재 잔액 (R = B − E)</td>
                <td className="num">{formatWon(balance)}</td>
              </tr>
              <tr>
                <td>
                  잔여 예상 지출 (F){travelTotal > 0 && ` — 강사비 ${formatWon(lessonTotal)} + 교통비 ${formatWon(travelTotal)}`}
                </td>
                <td className="num">{formatWon(remaining)}</td>
              </tr>
              <tr className="report-delta">
                <td>
                  <strong>{delta >= 0 ? '추경 반납(감액) 예상액' : '추경 증액 필요액'} (|R − F|)</strong>
                </td>
                <td className="num">
                  <strong>{formatWon(Math.abs(delta))}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {projection.periods.length > 0 && (
          <>
            <h3>2. 기간별 잔여 지출</h3>
            <div className="tablewrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>구간</th>
                    <th className="num">수업 횟수</th>
                    <th className="num">강사비</th>
                    <th className="num">교통비</th>
                    <th className="num">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.periods.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td className="num">{p.sessions}회</td>
                      <td className="num">{formatWon(p.lesson)}</td>
                      <td className="num">{p.travel > 0 ? formatWon(p.travel) : '−'}</td>
                      <td className="num">{formatWon(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h3>{projection.periods.length > 0 ? '3' : '2'}. 강좌별 산출 근거</h3>
        <div className="tablewrap">
          <table className="data">
            <thead>
              <tr>
                <th>강좌명</th>
                <th>구분</th>
                <th>요일</th>
                <th>운영 기간</th>
                <th className="num">회당 지급액</th>
                <th className="num">정규</th>
                <th className="num">휴강</th>
                <th className="num">보강</th>
                <th className="num">남은 횟수</th>
                <th className="num">교통비</th>
                <th className="num">잔여 지출</th>
              </tr>
            </thead>
            <tbody>
              {projection.courses.map((p) => {
                const c = courseById.get(p.courseId)
                return (
                  <tr key={p.courseId}>
                    <td>{p.name}</td>
                    <td>
                      {c?.program && c.program !== 'term' ? SEASON_LABELS[c.program] : '학기중'}
                    </td>
                    <td>{c ? weekdaysLabel(c.weekdays) : ''}</td>
                    <td>
                      {c?.startDate} ~ {c?.endDate}
                    </td>
                    <td className="num">{formatWon(p.perSessionPay)}</td>
                    <td className="num">{p.scheduled}</td>
                    <td className="num">−{p.closed}</td>
                    <td className="num">+{p.makeups}</td>
                    <td className="num">{p.sessions}</td>
                    <td className="num">{p.travelCost > 0 ? formatWon(p.travelCost) : '−'}</td>
                    <td className="num">{formatWon(p.total)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={10}>잔여 예상 지출 합계 (F)</td>
                <td className="num">{formatWon(remaining)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {closureRows.length > 0 && (
          <>
            <h3>{projection.periods.length > 0 ? '4' : '3'}. 휴강일 내역 (수업 영향분)</h3>
            <div className="tablewrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>날짜</th>
                    <th>사유</th>
                    <th>영향받는 강좌</th>
                    <th>보강</th>
                  </tr>
                </thead>
                <tbody>
                  {closureRows.map((r, i) => (
                    <tr key={i}>
                      <td>{dayLabel(r.date)}</td>
                      <td>{r.reason}</td>
                      <td>{r.names.join(', ')}</td>
                      <td>{r.makeup ? dayLabel(r.makeup) : '−'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p className="muted small-text report-foot">
          산출: 방과후 곳간 — 잔여 지출 = Σ 강좌별 [남은 횟수 × (회당 시수 × 시간당 단가)] +
          출강일수 × 일당 교통비 (같은 강사 같은 날 1회 계상)
        </p>
      </section>
    </div>
  )
}
