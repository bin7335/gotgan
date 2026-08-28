import { formatWon, type Projection } from '../core/calc'
import {
  CATEGORY_LABELS,
  type AppState,
  type BudgetLine,
  type CategoryKind,
} from '../core/types'
import { MoneyInput } from './fields'

const KIND_ORDER: CategoryKind[] = ['lesson', 'travel', 'material', 'etc']

/**
 * 산출내역별 추경 예상.
 * 강사비·교통비 산출내역이 유목당 1개면 전체 강좌의 자동 산출을 그대로 쓰고,
 * 여러 개면 각 산출내역에 강좌를 연결해 정확히 배분한다.
 */
export function BudgetLines({
  state,
  patch,
  projection,
}: {
  state: AppState
  patch: (p: Partial<AppState>) => void
  projection: Projection
}) {
  const lines = state.budgetLines ?? []
  if (lines.length === 0) return null

  const assignments = state.lineAssignments ?? {}
  const manuals = state.lineManuals ?? {}
  const projByCourse = new Map(projection.courses.map((p) => [p.courseId, p]))

  const costOf = (kind: CategoryKind, courseId: string): number => {
    const p = projByCourse.get(courseId)
    if (!p) return 0
    return kind === 'lesson' ? p.lessonCost : kind === 'travel' ? p.travelCost : 0
  }

  const linesOf = (kind: CategoryKind) => lines.filter((l) => l.kind === kind)

  /** 이 산출내역에 연결된 강좌 id (유목당 라인이 1개면 전체 강좌 자동 연결) */
  const assignedTo = (line: BudgetLine): string[] => {
    if (linesOf(line.kind).length <= 1) return state.courses.map((c) => c.id)
    return assignments[line.key] ?? []
  }

  const autoRemaining = (line: BudgetLine): number | undefined => {
    if (line.kind !== 'lesson' && line.kind !== 'travel') return undefined
    return assignedTo(line).reduce((s, id) => s + costOf(line.kind, id), 0)
  }

  const remainingOf = (line: BudgetLine): number =>
    autoRemaining(line) ?? manuals[line.key] ?? 0

  const toggleAssign = (line: BudgetLine, courseId: string, on: boolean) => {
    const next = { ...assignments }
    // 같은 유목의 다른 산출내역에서는 제거 (한 강좌는 한 예산에서만 지급)
    for (const sibling of linesOf(line.kind)) {
      const cur = next[sibling.key] ?? []
      next[sibling.key] =
        sibling.key === line.key
          ? on
            ? [...cur.filter((x) => x !== courseId), courseId]
            : cur.filter((x) => x !== courseId)
          : cur.filter((x) => x !== courseId)
    }
    patch({ lineAssignments: next })
  }

  /** 유목에 라인이 여러 개인데 어느 라인에도 연결되지 않은 강좌 (지출이 있는 것만) */
  const unassigned = (kind: CategoryKind): string[] => {
    if (linesOf(kind).length <= 1) return []
    const all = new Set(linesOf(kind).flatMap((l) => assignments[l.key] ?? []))
    return state.courses
      .filter((c) => !all.has(c.id) && costOf(kind, c.id) > 0)
      .map((c) => c.name)
  }

  const totalDelta = lines.reduce(
    (s, l) => s + (l.allocated - l.executed - remainingOf(l)),
    0,
  )

  return (
    <section className="card">
      <h2>산출내역별 추경 예상</h2>
      <div className="tablewrap">
        <table className="data">
          <thead>
            <tr>
              <th>산출내역</th>
              <th className="num">예산현액</th>
              <th className="num">원인행위액</th>
              <th className="num">잔액</th>
              <th className="num">잔여 예상 지출</th>
              <th className="num">추경 예상</th>
            </tr>
          </thead>
          <tbody>
            {KIND_ORDER.flatMap((kind) => {
              const group = linesOf(kind)
              if (group.length === 0) return []
              const multi = group.length > 1 && (kind === 'lesson' || kind === 'travel')
              const rows = group.map((line) => {
                const balance = line.allocated - line.executed
                const auto = autoRemaining(line)
                const remaining = remainingOf(line)
                const delta = balance - remaining
                return (
                  <tr key={line.key}>
                    <td>
                      {line.name} <span className="tag">{CATEGORY_LABELS[kind]}</span>
                      {multi && (
                        <details>
                          <summary className="small-text">
                            적용 강좌 선택 ({assignedTo(line).length})
                          </summary>
                          <div className="row wrap">
                            {state.courses.map((c) => (
                              <label key={c.id} className="inline">
                                <input
                                  type="checkbox"
                                  checked={(assignments[line.key] ?? []).includes(c.id)}
                                  onChange={(e) => toggleAssign(line, c.id, e.target.checked)}
                                />
                                {c.name}
                              </label>
                            ))}
                          </div>
                        </details>
                      )}
                    </td>
                    <td className="num">{formatWon(line.allocated)}</td>
                    <td className="num">{formatWon(line.executed)}</td>
                    <td className="num">{formatWon(balance)}</td>
                    <td className="num">
                      {auto !== undefined ? (
                        <span title="연결된 강좌의 자동 산출">{formatWon(auto)}</span>
                      ) : (
                        <MoneyInput
                          value={manuals[line.key] ?? 0}
                          ariaLabel={`${line.name} 잔여 예상 지출`}
                          onChange={(v) =>
                            patch({ lineManuals: { ...manuals, [line.key]: v } })
                          }
                        />
                      )}
                    </td>
                    <td className={delta >= 0 ? 'num' : 'num deficit'}>
                      {delta >= 0 ? `반납 ${formatWon(delta)}` : `부족 ${formatWon(-delta)}`}
                    </td>
                  </tr>
                )
              })
              const missing = unassigned(kind)
              if (missing.length > 0) {
                rows.push(
                  <tr key={`warn-${kind}`}>
                    <td colSpan={6} className="deficit">
                      ⚠ {CATEGORY_LABELS[kind]} 산출내역이 여러 개입니다 — 다음 강좌를 예산에
                      연결하세요: {missing.join(', ')}
                    </td>
                  </tr>,
                )
              }
              return rows
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>합계</td>
              <td className={totalDelta >= 0 ? 'num' : 'num deficit'}>
                {totalDelta >= 0
                  ? `반납 ${formatWon(totalDelta)}`
                  : `부족 ${formatWon(-totalDelta)}`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="hint">
        추경 감액·증액 요구서는 이 표의 산출내역 단위로 작성하면 됩니다. 강사비·교통비는 자동
        산출, 재료비·기타는 잔여 구입 계획액을 직접 입력하세요. 집행액은 원인행위액 기준입니다.
      </p>
    </section>
  )
}
