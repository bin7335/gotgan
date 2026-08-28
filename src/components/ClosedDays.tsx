import { useState } from 'react'
import { WEEKDAY_LABELS, isValidISODate, weekdayOf } from '../core/date'
import { HOLIDAY_DATA_END, HOLIDAY_RANGE_LABEL, KR_HOLIDAYS } from '../core/holidays'
import { SEASON_LABELS, type AppState, type ClosedDay, type Course, type ISODate, type Season } from '../core/types'

function dayLabel(d: ISODate): string {
  return `${d} (${WEEKDAY_LABELS[weekdayOf(d)]})`
}

/** 해당 날짜에 정규 수업이 있는 강좌 (휴강 범위 안에서) */
function affectedCourses(courses: Course[], entry: Pick<ClosedDay, 'date' | 'scope'>): Course[] {
  return courses.filter(
    (c) =>
      (entry.scope === 'all' || entry.scope.includes(c.id)) &&
      c.startDate <= entry.date &&
      entry.date <= c.endDate &&
      c.weekdays.includes(weekdayOf(entry.date)),
  )
}

export function ClosedDays({
  state,
  patch,
}: {
  state: AppState
  patch: (p: Partial<AppState>) => void
}) {
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [scopeAll, setScopeAll] = useState(true)
  const [picked, setPicked] = useState<string[]>([])
  const [makeupDate, setMakeupDate] = useState('')
  const [error, setError] = useState('')

  const add = () => {
    if (!isValidISODate(date)) {
      setError('휴강 날짜를 선택하세요.')
      return
    }
    if (!reason.trim()) {
      setError('사유를 입력하세요. (예: 현장체험학습)')
      return
    }
    if (!scopeAll && picked.length === 0) {
      setError('휴강할 강좌를 선택하세요.')
      return
    }
    if (makeupDate && !isValidISODate(makeupDate)) {
      setError('보강 날짜가 올바르지 않습니다.')
      return
    }
    setError('')
    const entry: ClosedDay = {
      id: crypto.randomUUID(),
      date,
      reason: reason.trim(),
      scope: scopeAll ? 'all' : picked,
      makeupDate: makeupDate || undefined,
    }
    patch({ closedDays: [...state.closedDays, entry].sort((a, b) => (a.date < b.date ? -1 : 1)) })
    setDate('')
    setReason('')
    setMakeupDate('')
    setPicked([])
  }

  // 강좌 운영 기간 범위의 공휴일만 보여준다 (강좌가 없으면 전체)
  const [minStart, maxEnd] = state.courses.length
    ? [
        state.courses.reduce((m, c) => (c.startDate < m ? c.startDate : m), '9999-12-31'),
        state.courses.reduce((m, c) => (c.endDate > m ? c.endDate : m), '0000-01-01'),
      ]
    : ['0000-01-01', '9999-12-31']
  const holidays = Object.entries(KR_HOLIDAYS).filter(([d]) => d >= minStart && d <= maxEnd)

  const sorted = [...state.closedDays].sort((a, b) => (a.date < b.date ? -1 : 1))

  return (
    <div className="stack">
      <section className="card">
        <h2>휴강일 등록</h2>
        <p className="hint">
          학교 행사·재량휴업 등으로 <strong>수업하지 않는 날짜</strong>만 등록하면 됩니다. 법정
          공휴일은 이미 자동으로 반영되어 있습니다 (아래 목록).
        </p>
        <div className="field-grid">
          <label>
            날짜 *
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            사유 *
            <input
              type="text"
              value={reason}
              placeholder="예: 현장체험학습"
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label>
            보강 날짜 (선택)
            <input
              type="date"
              value={makeupDate}
              onChange={(e) => setMakeupDate(e.target.value)}
            />
          </label>
        </div>
        <div className="row wrap">
          <label className="inline">
            <input type="radio" checked={scopeAll} onChange={() => setScopeAll(true)} /> 전체 강좌
          </label>
          <label className="inline">
            <input type="radio" checked={!scopeAll} onChange={() => setScopeAll(false)} /> 일부
            강좌만
          </label>
          {!scopeAll &&
            state.courses.map((c) => (
              <label key={c.id} className="inline">
                <input
                  type="checkbox"
                  checked={picked.includes(c.id)}
                  onChange={(e) =>
                    setPicked(
                      e.target.checked ? [...picked, c.id] : picked.filter((id) => id !== c.id),
                    )
                  }
                />
                {c.name}
              </label>
            ))}
        </div>
        {date && isValidISODate(date) && (
          <p className="hint">
            {dayLabel(date)} —{' '}
            {(() => {
              const hit = affectedCourses(state.courses, {
                date,
                scope: scopeAll ? 'all' : picked,
              })
              return hit.length
                ? `영향받는 강좌: ${hit.map((c) => c.name).join(', ')}`
                : '이 날짜에 수업이 있는 강좌가 없어 계산에는 영향이 없습니다.'
            })()}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button className="btn primary" onClick={add}>
            휴강 등록
          </button>
        </div>
        <p className="hint">
          보강 날짜를 지정하면 그 회차는 지출 감소에서 제외됩니다 (수업이 이동한 것으로 계산).
        </p>
      </section>

      <section className="card">
        <h2>등록된 휴강일 ({sorted.length})</h2>
        {sorted.length === 0 ? (
          <p className="hint">아직 등록된 휴강일이 없습니다.</p>
        ) : (
          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>사유</th>
                  <th>적용</th>
                  <th>영향받는 강좌</th>
                  <th>보강</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => {
                  const hit = affectedCourses(state.courses, c)
                  return (
                    <tr key={c.id}>
                      <td>{dayLabel(c.date)}</td>
                      <td>{c.reason}</td>
                      <td>
                        {c.scope === 'all'
                          ? '전체'
                          : c.scope
                              .map(
                                (id) =>
                                  state.courses.find((x) => x.id === id)?.name ?? '(삭제된 강좌)',
                              )
                              .join(', ')}
                      </td>
                      <td>{hit.length ? hit.map((x) => x.name).join(', ') : '영향 없음'}</td>
                      <td>{c.makeupDate ? dayLabel(c.makeupDate) : '−'}</td>
                      <td>
                        <button
                          className="btn small danger"
                          onClick={() =>
                            patch({ closedDays: state.closedDays.filter((x) => x.id !== c.id) })
                          }
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>공휴일 (자동 반영)</h2>
        <label className="inline">
          <input
            type="checkbox"
            checked={state.settings.autoHolidays}
            onChange={(e) =>
              patch({ settings: { ...state.settings, autoHolidays: e.target.checked } })
            }
          />
          법정 공휴일을 자동으로 휴강 처리 (내장 데이터: {HOLIDAY_RANGE_LABEL})
        </label>
        {state.settings.autoHolidays && (
          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>공휴일</th>
                  <th>수업 영향</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {holidays.map(([d, name]) => {
                  const off = state.settings.disabledHolidays.includes(d)
                  const hit = affectedCourses(state.courses, { date: d, scope: 'all' })
                  return (
                    <tr key={d} className={off ? 'muted' : undefined}>
                      <td>{dayLabel(d)}</td>
                      <td>
                        {name}
                        {off && ' — 해제됨(수업일로 계산)'}
                      </td>
                      <td>{hit.length ? hit.map((x) => x.name).join(', ') : '−'}</td>
                      <td>
                        <button
                          className="btn small"
                          onClick={() =>
                            patch({
                              settings: {
                                ...state.settings,
                                disabledHolidays: off
                                  ? state.settings.disabledHolidays.filter((x) => x !== d)
                                  : [...state.settings.disabledHolidays, d],
                              },
                            })
                          }
                        >
                          {off ? '자동 휴강 복원' : '이날은 수업함'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {state.courses.length > 0 && (
          <p className="hint">강좌 운영 기간({minStart} ~ {maxEnd}) 안의 공휴일만 표시합니다.</p>
        )}
        {state.settings.autoHolidays && state.courses.length > 0 && maxEnd > HOLIDAY_DATA_END && (
          <p className="form-error">
            ⚠ 내장 공휴일 데이터는 {HOLIDAY_DATA_END}까지만 있습니다. 그 이후({maxEnd}까지)의
            공휴일은 자동 반영되지 않으니 직접 휴강일로 등록하세요 — 누락되면 반납 예상액이
            실제보다 작게 계산됩니다.
          </p>
        )}
      </section>

      <Vacations state={state} patch={patch} />
    </div>
  )
}

function Vacations({
  state,
  patch,
}: {
  state: AppState
  patch: (p: Partial<AppState>) => void
}) {
  const [season, setSeason] = useState<Season>('summer')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState('')

  const add = () => {
    if (!isValidISODate(start) || !isValidISODate(end)) return setError('기간을 입력하세요.')
    if (start > end) return setError('종료일이 시작일보다 앞설 수 없습니다.')
    setError('')
    patch({
      vacations: [
        ...state.vacations,
        {
          id: crypto.randomUUID(),
          name: SEASON_LABELS[season],
          season,
          startDate: start,
          endDate: end,
        },
      ].sort((a, b) => (a.startDate < b.startDate ? -1 : 1)),
    })
    setStart('')
    setEnd('')
  }

  return (
    <section className="card">
      <h2>방학 기간</h2>
      <p className="hint">
        방학 기간을 등록하면 대시보드에서 <strong>학기중과 방학 기간의 잔여 지출이 분리</strong>
        되어 표시되고, 강좌 탭의 여름방학·겨울방학 프로그램 등록 시 운영 기간이 자동으로
        채워집니다.
      </p>
      <div className="row wrap">
        {(Object.keys(SEASON_LABELS) as Season[]).map((s) => (
          <label key={s} className="inline">
            <input type="radio" checked={season === s} onChange={() => setSeason(s)} />{' '}
            {SEASON_LABELS[s]}
          </label>
        ))}
      </div>
      <div className="field-grid">
        <label>
          시작일 *
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          종료일 *
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn primary" onClick={add}>
          방학 기간 추가
        </button>
      </div>
      {state.vacations.length > 0 && (
        <ul>
          {state.vacations.map((v) => (
            <li key={v.id} className="row spread">
              <span>
                <strong>{v.name}</strong> · {v.startDate} ~ {v.endDate}
              </span>
              <button
                className="btn small danger"
                onClick={() =>
                  patch({ vacations: state.vacations.filter((x) => x.id !== v.id) })
                }
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
