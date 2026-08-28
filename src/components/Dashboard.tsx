import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Tab } from '../App'
import { formatWon, weekdaysLabel, type Projection } from '../core/calc'
import {
  CATEGORY_LABELS,
  SEASON_LABELS,
  type AppState,
  type ISODate,
} from '../core/types'
import { sampleState } from '../storage'
import { BudgetGuide } from './BudgetGuide'
import { BudgetImport } from './BudgetImport'
import { BudgetLines } from './BudgetLines'
import { MoneyInput } from './fields'

/**
 * 대시보드는 위에서 아래로 "질문에 답하는 순서"를 따른다:
 * ① 얼마를 반납/증액하나 (히어로) → ② 확인할 문제 (경고) → ③ 예산이 어떻게 흘러가나 (흐름)
 * → ④ 산출내역별로는? (추경 서류용) → ⑤ 앞으로 어떻게 쓰나 (가이드)
 * 상세 내역과 입력은 아래에 접어 둔다.
 */
export function Dashboard({
  state,
  projection,
  warnings,
  baseDate,
  patch,
  setState,
  goTo,
}: {
  state: AppState
  projection: Projection
  warnings: string[]
  baseDate: ISODate
  patch: (p: Partial<AppState>) => void
  setState: Dispatch<SetStateAction<AppState>>
  goTo: (tab: Tab) => void
}) {
  const { allocated, executed, balance, remaining, delta, lessonTotal, travelTotal } = projection
  const courseById = new Map(state.courses.map((c) => [c.id, c]))
  const empty = state.courses.length === 0
  const [showImport, setShowImport] = useState(false)

  // 히어로 아래 유목별 요약 칩: 산출내역 정보가 있으면 그것으로, 없으면 유목 집계로
  const kindSummaries = (() => {
    const kinds = Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]
    const lines = state.budgetLines ?? []
    const manuals = state.lineManuals ?? {}
    if (lines.length > 0) {
      return kinds
        .filter((k) => lines.some((l) => l.kind === k))
        .map((k) => {
          const mine = lines.filter((l) => l.kind === k)
          const balanceSum = mine.reduce((s, l) => s + l.allocated - l.executed, 0)
          const rem =
            k === 'lesson'
              ? lessonTotal
              : k === 'travel'
                ? travelTotal
                : mine.reduce((s, l) => s + (manuals[l.key] ?? 0), 0)
          return { kind: k, delta: balanceSum - rem }
        })
    }
    return (state.categories ?? []).map((c) => ({
      kind: c.kind,
      delta:
        c.allocated -
        c.executed -
        (c.kind === 'lesson'
          ? lessonTotal
          : c.kind === 'travel'
            ? travelTotal
            : (c.manualRemaining ?? 0)),
    }))
  })()

  return (
    <div className="stack">
      {empty && (
        <section className="card onboarding">
          <h2>아직 등록된 강좌가 없습니다</h2>
          <p>순서대로 안내받으며 입력하려면 설정 절차를 여세요.</p>
          <div className="row">
            <button className="btn primary" onClick={() => patch({ setupDone: false })}>
              설정 절차 열기
            </button>
            <button className="btn" onClick={() => goTo('courses')}>
              강좌 탭에서 바로 등록
            </button>
            <button className="btn" onClick={() => setState(sampleState())}>
              예시 데이터로 살펴보기
            </button>
          </div>
        </section>
      )}

      {/* ① 결론 */}
      <section className={`card hero ${delta >= 0 ? 'hero-return' : 'hero-need'}`}>
        <p className="hero-label">{delta >= 0 ? '추경 반납(감액) 예상액' : '추경 증액 필요액'}</p>
        <p className="hero-value">{formatWon(Math.abs(delta))}</p>
        <p className="hero-sub">
          {baseDate} 기준 · 현재 잔액 {formatWon(balance)} − 잔여 예상 지출 {formatWon(remaining)}
        </p>
        {kindSummaries.length > 0 && (
          <div className="hero-chips">
            {kindSummaries.map((k) => (
              <span key={k.kind} className={k.delta >= 0 ? 'kchip ok' : 'kchip bad'}>
                {CATEGORY_LABELS[k.kind]} {k.delta >= 0 ? '반납' : '부족'}{' '}
                {formatWon(Math.abs(k.delta))}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ② 확인할 문제 */}
      {warnings.length > 0 && (
        <section className="card warnbox" role="alert">
          <h2>확인 필요</h2>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      {/* ③ 예산 흐름 */}
      {!empty && allocated > 0 && (
        <section className="card">
          <div className="row spread">
            <h2>예산 흐름</h2>
            <label className="inline">
              기준일
              <input
                type="date"
                value={baseDate}
                onChange={(e) => patch({ baseDate: e.target.value || undefined })}
              />
              {state.baseDate && (
                <button className="btn small" onClick={() => patch({ baseDate: undefined })}>
                  오늘로
                </button>
              )}
            </label>
          </div>
          <BudgetBar projection={projection} />
          <div className="kpis flow">
            <div className="kpi">
              <p className="kpi-label">기정예산</p>
              <p className="kpi-value">{formatWon(allocated)}</p>
            </div>
            <div className="kpi">
              <p className="kpi-label">집행액</p>
              <p className="kpi-value">{formatWon(executed)}</p>
            </div>
            <div className="kpi">
              <p className="kpi-label">현재 잔액</p>
              <p className="kpi-value">{formatWon(balance)}</p>
            </div>
            <div className="kpi">
              <p className="kpi-label">잔여 예상 지출</p>
              <p className="kpi-value">{formatWon(remaining)}</p>
              {travelTotal > 0 && (
                <p className="kpi-sub">
                  강사비 {formatWon(lessonTotal)} + 교통비 {formatWon(travelTotal)}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ④ 산출내역별 (추경 서류용) */}
      {state.budgetLines && state.budgetLines.length > 0 ? (
        <BudgetLines state={state} patch={patch} projection={projection} />
      ) : (
        state.categories &&
        state.categories.length > 0 && (
          <section className="card">
            <h2>유목별 예산 현황</h2>
            <div className="tablewrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>유목</th>
                    <th className="num">기정예산</th>
                    <th className="num">집행(원인행위)액</th>
                    <th className="num">잔액</th>
                    <th className="num">잔여 예상 지출</th>
                    <th className="num">추경 예상</th>
                  </tr>
                </thead>
                <tbody>
                  {state.categories.map((cat) => {
                    const catBalance = cat.allocated - cat.executed
                    const auto =
                      cat.kind === 'lesson'
                        ? lessonTotal
                        : cat.kind === 'travel'
                          ? travelTotal
                          : undefined
                    const catRemaining = auto ?? cat.manualRemaining ?? 0
                    const catDelta = catBalance - catRemaining
                    return (
                      <tr key={cat.kind}>
                        <td>{CATEGORY_LABELS[cat.kind]}</td>
                        <td className="num">{formatWon(cat.allocated)}</td>
                        <td className="num">{formatWon(cat.executed)}</td>
                        <td className="num">{formatWon(catBalance)}</td>
                        <td className="num">
                          {auto !== undefined ? (
                            <span title="강좌·휴강일 기준 자동 산출">{formatWon(auto)}</span>
                          ) : (
                            <MoneyInput
                              value={cat.manualRemaining ?? 0}
                              ariaLabel={`${CATEGORY_LABELS[cat.kind]} 잔여 예상 지출`}
                              onChange={(manualRemaining) =>
                                patch({
                                  categories: state.categories!.map((c) =>
                                    c.kind === cat.kind ? { ...c, manualRemaining } : c,
                                  ),
                                })
                              }
                            />
                          )}
                        </td>
                        <td className={catDelta >= 0 ? 'num' : 'num deficit'}>
                          {catDelta >= 0
                            ? `반납 ${formatWon(catDelta)}`
                            : `부족 ${formatWon(-catDelta)}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      )}

      {/* ⑤ 앞으로 어떻게 쓰나 */}
      {!empty && <BudgetGuide state={state} projection={projection} />}

      {/* 상세 내역 (접힘) */}
      {!empty && (
        <details className="card fold">
          <summary>상세 내역 — 강좌별 산출 · 기간별(학기/방학)</summary>
          <h3>강좌별 산출 내역</h3>
          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  <th>강좌</th>
                  <th>요일</th>
                  <th className="num">회당 지급액</th>
                  <th className="num">남은 횟수</th>
                  <th className="num">교통비</th>
                  <th className="num">잔여 지출</th>
                </tr>
              </thead>
              <tbody>
                {projection.courses.map((p) => {
                  const course = courseById.get(p.courseId)
                  return (
                    <tr key={p.courseId}>
                      <td>
                        {p.name}
                        {(course?.program === 'summer' || course?.program === 'winter') && (
                          <span className="tag">{SEASON_LABELS[course.program]}</span>
                        )}
                      </td>
                      <td>{course ? weekdaysLabel(course.weekdays) : ''}</td>
                      <td className="num">{formatWon(p.perSessionPay)}</td>
                      <td
                        className="num"
                        title={`정규 ${p.scheduled}회 − 휴강 ${p.closed}회 + 보강 ${p.makeups}회`}
                      >
                        {p.sessions}회
                      </td>
                      <td className="num">{p.travelCost > 0 ? formatWon(p.travelCost) : '−'}</td>
                      <td className="num">{formatWon(p.total)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>잔여 예상 지출 합계 (F)</td>
                  <td className="num">{formatWon(remaining)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {projection.periods.length > 0 && (
            <>
              <h3>기간별 잔여 지출 (학기중 / 방학)</h3>
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
        </details>
      )}

      {/* 입력 (접힘) */}
      <details className="card fold" open={empty || allocated === 0}>
        <summary>예산 입력 · 엑셀 가져오기</summary>
        <div className="row" style={{ margin: '0.75rem 0' }}>
          <button className="btn primary" onClick={() => setShowImport((v) => !v)}>
            세출예산 엑셀에서 가져오기
          </button>
          {state.importMemo && (
            <span className="muted small-text">
              마지막 가져오기: {state.importMemo.fileName} ({state.importMemo.importedAt})
            </span>
          )}
        </div>
        {showImport && (
          <BudgetImport state={state} patch={patch} onClose={() => setShowImport(false)} />
        )}
        <div className="field-grid">
          <label>
            기정예산 (원)
            <MoneyInput
              value={state.budget.allocated}
              onChange={(a) => patch({ budget: { ...state.budget, allocated: a } })}
            />
          </label>
          <label>
            현재까지 집행액 (원)
            <MoneyInput
              value={state.budget.executed}
              onChange={(e) => patch({ budget: { ...state.budget, executed: e } })}
            />
          </label>
        </div>
        <p className="hint">
          집행액은 <strong>기준일 전날까지 지급 완료된 금액</strong>을 입력하세요. 엑셀 가져오기를
          쓰면 자동으로 채워집니다 (원인행위액 기준).
        </p>
      </details>
    </div>
  )
}

/** 기정예산 구성 막대: 집행액 → 잔여 예상 지출 → 반납 예상(또는 부족) */
function BudgetBar({ projection }: { projection: Projection }) {
  const { allocated, executed, remaining, delta } = projection
  const total = Math.max(allocated, executed + remaining)
  if (total <= 0) return null

  const pct = (n: number) => `${((n / total) * 100).toFixed(2)}%`
  const over = delta < 0 ? Math.min(-delta, remaining) : 0

  const segments =
    delta >= 0
      ? [
          { key: 'executed', label: '집행액', value: executed, cls: 'seg-executed' },
          { key: 'remaining', label: '잔여 예상 지출', value: remaining, cls: 'seg-remaining' },
          { key: 'surplus', label: '반납 예상', value: delta, cls: 'seg-surplus' },
        ]
      : [
          { key: 'executed', label: '집행액', value: executed, cls: 'seg-executed' },
          {
            key: 'remaining',
            label: '잔여 예상 지출',
            value: remaining - over,
            cls: 'seg-remaining',
          },
          { key: 'over', label: '▲ 예산 초과(부족)', value: over, cls: 'seg-over' },
        ]

  const visible = segments.filter((s) => s.value > 0)

  return (
    <>
      <div
        className="budget-bar"
        role="img"
        aria-label={visible.map((s) => `${s.label} ${formatWon(s.value)}`).join(', ')}
      >
        {visible.map((s) => (
          <div
            key={s.key}
            className={`seg ${s.cls}`}
            style={{ width: pct(s.value) }}
            title={`${s.label} ${formatWon(s.value)}`}
          />
        ))}
      </div>
      <ul className="legend">
        {visible.map((s) => (
          <li key={s.key}>
            <span className={`swatch ${s.cls}`} aria-hidden="true" />
            {s.label} <strong>{formatWon(s.value)}</strong>
          </li>
        ))}
      </ul>
    </>
  )
}
