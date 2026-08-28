import { formatWon, monthlyPlan, type Projection } from '../core/calc'
import type { AppState } from '../core/types'

function monthLabel(m: string): string {
  const [y, mm] = m.split('-')
  return `${y}년 ${Number(mm)}월`
}

/** 월별 지급 예정표 + 규칙 기반 예산 활용 조언 */
export function BudgetGuide({
  state,
  projection,
}: {
  state: AppState
  projection: Projection
}) {
  const plan = monthlyPlan(projection)
  if (state.courses.length === 0 || plan.length === 0) return null

  const { lessonTotal, delta } = projection
  const totalSessions = projection.courses.reduce((s, p) => s + p.sessions, 0)
  const avgPerSession = totalSessions > 0 ? Math.round(lessonTotal / totalSessions) : 0
  const months = plan.length

  const lines = state.budgetLines ?? []
  const manuals = state.lineManuals ?? {}
  const materialLines = lines.filter((l) => l.kind === 'material')

  const advice: string[] = []
  if (delta >= 0) {
    advice.push(
      `지금 추경에서 ${formatWon(delta)}을 반납(감액)해도 남은 수업 운영에는 지장이 없습니다.`,
    )
    if (avgPerSession > 0 && delta >= avgPerSession) {
      advice.push(
        `반납하지 않고 활용한다면: 회당 평균 지급액 ${formatWon(avgPerSession)} 기준으로 약 ${Math.floor(delta / avgPerSession)}회 수업을 늘릴 수 있습니다 (강좌 추가, 운영 기간 연장, 방학 특강 증설).`,
      )
    }
  } else {
    advice.push(
      `현재 계획대로면 ${formatWon(-delta)}이 부족합니다 — 추경 증액 요구가 필요합니다.`,
    )
    if (avgPerSession > 0) {
      advice.push(
        `참고: 보강 없는 휴강이 약 ${Math.ceil(-delta / avgPerSession)}회 발생하면 증액 없이 해소됩니다.`,
      )
    }
  }
  for (const line of materialLines) {
    const balance = line.allocated - line.executed
    if (balance <= 0) continue
    const planned = manuals[line.key] ?? 0
    if (planned > balance) {
      advice.push(
        `『${line.name}』은 계획한 지출이 잔액보다 ${formatWon(planned - balance)} 많습니다 — 구입 계획을 줄이거나 증액이 필요합니다.`,
      )
    } else {
      advice.push(
        `『${line.name}』 잔액 ${formatWon(balance)} — 남은 ${months}개월 동안 월 평균 ${formatWon(Math.floor(balance / months))} 이내로 집행하면 잔액 안에서 소진됩니다.`,
      )
    }
  }

  return (
    <section className="card">
      <h2>예산 활용 가이드</h2>
      <ul>
        {advice.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>
      <details className="fold-inline" open>
        <summary>월별 지급 예정 (강사비·교통비)</summary>
        <div className="tablewrap">
        <table className="data">
          <thead>
            <tr>
              <th>월</th>
              <th className="num">수업 횟수</th>
              <th className="num">강사비</th>
              <th className="num">교통비</th>
              <th className="num">합계</th>
            </tr>
          </thead>
          <tbody>
            {plan.map((r) => (
              <tr key={r.month}>
                <td>{monthLabel(r.month)}</td>
                <td className="num">{r.sessions}회</td>
                <td className="num">{formatWon(r.lesson)}</td>
                <td className="num">{r.travel > 0 ? formatWon(r.travel) : '−'}</td>
                <td className="num">{formatWon(r.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>잔여 예상 지출 합계 (F)</td>
              <td className="num">{formatWon(projection.remaining)}</td>
            </tr>
          </tfoot>
        </table>
        </div>
        <p className="hint">매월 지급품의 금액을 미리 확인하는 용도입니다 (기준일 이후 예정분만).</p>
      </details>
    </section>
  )
}
