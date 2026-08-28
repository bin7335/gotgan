import { useState } from 'react'
import { formatWon, weekdaysLabel } from '../core/calc'
import { WEEKDAY_LABELS, isValidISODate } from '../core/date'
import { DEFAULT_HOURLY_RATE, SEASON_LABELS, type Course, type Vacation } from '../core/types'
import { MoneyInput } from './fields'
import { TimetableImport } from './TimetableImport'

type Program = 'term' | 'summer' | 'winter'

const PROGRAM_LABELS: Record<Program, string> = { term: '학기중 강좌', ...SEASON_LABELS }

const PROGRAMS: Program[] = ['term', 'summer', 'winter']

// 방과후 수업은 평일만 — 토·일은 선택지에서 제외
const WEEKDAY_ORDER = [1, 2, 3, 4, 5]

const programOf = (c: Course): Program => c.program ?? 'term'

/* ---------- 일괄 등록 ---------- */

interface Row {
  key: string
  name: string
  instructor: string
  weekdays: number[]
  hoursPerSession: number
  travelPerDay: number
}

const emptyRow = (): Row => ({
  key: crypto.randomUUID(),
  name: '',
  instructor: '',
  weekdays: [],
  hoursPerSession: 1,
  travelPerDay: 0,
})

function WeekdayChips({
  value,
  onChange,
}: {
  value: number[]
  onChange: (weekdays: number[]) => void
}) {
  return (
    <span className="chips">
      {WEEKDAY_ORDER.map((w) => (
        <button
          key={w}
          type="button"
          className={value.includes(w) ? 'chip-day on' : 'chip-day'}
          aria-pressed={value.includes(w)}
          onClick={() =>
            onChange(value.includes(w) ? value.filter((x) => x !== w) : [...value, w])
          }
        >
          {WEEKDAY_LABELS[w]}
        </button>
      ))}
    </span>
  )
}

function BulkAdd({
  program,
  courses,
  vacations,
  onChange,
}: {
  program: Program
  courses: Course[]
  vacations: Vacation[]
  onChange: (c: Course[]) => void
}) {
  // 방학 프로그램은 해당 계절의 방학 기간으로 기간을 미리 채워준다
  const preset = program === 'term' ? undefined : vacations.find((v) => v.season === program)
  const [startDate, setStartDate] = useState(preset?.startDate ?? '')
  const [endDate, setEndDate] = useState(preset?.endDate ?? '')
  const [hourlyRate, setHourlyRate] = useState(DEFAULT_HOURLY_RATE)
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()])
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const setRow = (key: string, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))

  const submit = () => {
    setDone('')
    const filled = rows.filter((r) => r.name.trim())
    if (filled.length === 0) {
      setError('강좌명을 하나 이상 입력하세요.')
      return
    }
    if (!isValidISODate(startDate) || !isValidISODate(endDate)) {
      setError('공통 운영 시작일과 종료일을 입력하세요.')
      return
    }
    if (startDate > endDate) {
      setError('종료일이 시작일보다 앞설 수 없습니다.')
      return
    }
    if (!(hourlyRate > 0)) {
      setError('시간당 단가는 0보다 커야 합니다.')
      return
    }
    for (const r of filled) {
      if (r.weekdays.length === 0) {
        setError(`'${r.name.trim()}' 강좌의 수업 요일을 선택하세요.`)
        return
      }
      if (!(r.hoursPerSession > 0)) {
        setError(`'${r.name.trim()}' 강좌의 회당 시수는 0보다 커야 합니다.`)
        return
      }
    }
    setError('')
    const added: Course[] = filled.map((r) => ({
      id: crypto.randomUUID(),
      name: r.name.trim(),
      instructor: r.instructor.trim() || undefined,
      program,
      weekdays: [...r.weekdays].sort(),
      hoursPerSession: r.hoursPerSession,
      hourlyRate,
      travelPerDay: r.travelPerDay > 0 ? r.travelPerDay : undefined,
      startDate,
      endDate,
    }))
    onChange([...courses, ...added])
    setRows([emptyRow(), emptyRow(), emptyRow()])
    setDone(`${added.length}개를 추가했습니다. 기간·단가가 다른 것은 아래 목록에서 수정하세요.`)
  }

  return (
    <section className="card">
      <h2>
        {program === 'term'
          ? '학기중 강좌 등록 (여러 개 한번에)'
          : `${PROGRAM_LABELS[program]} 프로그램 등록 (여러 개 한번에)`}
      </h2>
      {program !== 'term' && !preset && (
        <p className="hint">
          휴강일 탭에서 <strong>{PROGRAM_LABELS[program]} 기간</strong>을 먼저 등록하면 운영
          기간이 자동으로 채워지고, 대시보드에서 학기중과 분리 산출됩니다.
        </p>
      )}
      <div className="field-grid">
        <label>
          공통 운영 시작일 *
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          공통 운영 종료일 *
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <label>
          공통 시간당 단가 (원) *
          <MoneyInput value={hourlyRate} onChange={setHourlyRate} />
        </label>
      </div>
      <div className="tablewrap">
        <table className="data bulk">
          <thead>
            <tr>
              <th>{program === 'term' ? '강좌명' : '프로그램명'}</th>
              <th>강사명 (선택)</th>
              <th>요일</th>
              <th className="num">회당 시수</th>
              <th className="num">교통비/일</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>
                  <input
                    type="text"
                    value={r.name}
                    placeholder={
                      program === 'term'
                        ? '예: 코딩교실'
                        : program === 'summer'
                          ? '예: 여름 코딩캠프'
                          : '예: 겨울 코딩캠프'
                    }
                    aria-label="강좌명"
                    onChange={(e) => setRow(r.key, { name: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={r.instructor}
                    aria-label="강사명"
                    onChange={(e) => setRow(r.key, { instructor: e.target.value })}
                  />
                </td>
                <td>
                  <WeekdayChips
                    value={r.weekdays}
                    onChange={(weekdays) => setRow(r.key, { weekdays })}
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    className="narrow"
                    value={r.hoursPerSession}
                    aria-label="회당 시수"
                    onChange={(e) => setRow(r.key, { hoursPerSession: Number(e.target.value) })}
                  />
                </td>
                <td className="num">
                  <MoneyInput
                    value={r.travelPerDay}
                    ariaLabel="교통비"
                    onChange={(travelPerDay) => setRow(r.key, { travelPerDay })}
                  />
                </td>
                <td>
                  <button
                    className="btn small"
                    aria-label="행 삭제"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {done && <p className="hint">{done}</p>}
      <div className="row">
        <button className="btn" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
          + 행 추가
        </button>
        <button className="btn primary" onClick={submit}>
          입력한 {program === 'term' ? '강좌' : '프로그램'} 모두 추가
        </button>
      </div>
      <p className="hint">이름이 비어 있는 행은 건너뜁니다.</p>
    </section>
  )
}

/* ---------- 개별 수정 ---------- */

interface Draft {
  name: string
  instructor: string
  program: Program
  weekdays: number[]
  hoursPerSession: number
  hourlyRate: number
  travelPerDay: number
  startDate: string
  endDate: string
}

const toDraft = (c: Course): Draft => ({
  name: c.name,
  instructor: c.instructor ?? '',
  program: programOf(c),
  weekdays: [...c.weekdays],
  hoursPerSession: c.hoursPerSession,
  hourlyRate: c.hourlyRate,
  travelPerDay: c.travelPerDay ?? 0,
  startDate: c.startDate,
  endDate: c.endDate,
})

function EditCard({
  course,
  onSave,
  onCancel,
}: {
  course: Course
  onSave: (c: Course) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(course))
  const [error, setError] = useState('')
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))

  const submit = () => {
    if (!draft.name.trim()) return setError('강좌명을 입력하세요.')
    if (draft.weekdays.length === 0) return setError('수업 요일을 하나 이상 선택하세요.')
    if (!(draft.hoursPerSession > 0)) return setError('회당 시수는 0보다 커야 합니다.')
    if (!(draft.hourlyRate > 0)) return setError('시간당 단가는 0보다 커야 합니다.')
    if (!isValidISODate(draft.startDate) || !isValidISODate(draft.endDate))
      return setError('운영 시작일과 종료일을 입력하세요.')
    if (draft.startDate > draft.endDate) return setError('종료일이 시작일보다 앞설 수 없습니다.')
    setError('')
    onSave({
      id: course.id,
      name: draft.name.trim(),
      instructor: draft.instructor.trim() || undefined,
      program: draft.program,
      weekdays: [...draft.weekdays].sort(),
      hoursPerSession: draft.hoursPerSession,
      hourlyRate: draft.hourlyRate,
      travelPerDay: draft.travelPerDay > 0 ? draft.travelPerDay : undefined,
      startDate: draft.startDate,
      endDate: draft.endDate,
    })
  }

  return (
    <section className="card onboarding">
      <h2>수정 — {course.name}</h2>
      <div className="row wrap">
        {PROGRAMS.map((p) => (
          <label key={p} className="inline">
            <input
              type="radio"
              checked={draft.program === p}
              onChange={() => set({ program: p })}
            />{' '}
            {PROGRAM_LABELS[p]}
          </label>
        ))}
      </div>
      <div className="field-grid">
        <label>
          강좌명 *
          <input type="text" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label>
          강사명 (선택)
          <input
            type="text"
            value={draft.instructor}
            onChange={(e) => set({ instructor: e.target.value })}
          />
        </label>
        <label>
          회당 시수 *
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={draft.hoursPerSession}
            onChange={(e) => set({ hoursPerSession: Number(e.target.value) })}
          />
        </label>
        <label>
          시간당 단가 (원) *
          <MoneyInput value={draft.hourlyRate} onChange={(hourlyRate) => set({ hourlyRate })} />
        </label>
        <label>
          교통비 / 출강 1일 (원)
          <MoneyInput
            value={draft.travelPerDay}
            onChange={(travelPerDay) => set({ travelPerDay })}
          />
        </label>
        <label>
          운영 시작일 *
          <input
            type="date"
            value={draft.startDate}
            onChange={(e) => set({ startDate: e.target.value })}
          />
        </label>
        <label>
          운영 종료일 *
          <input
            type="date"
            value={draft.endDate}
            onChange={(e) => set({ endDate: e.target.value })}
          />
        </label>
      </div>
      <div className="row wrap">
        <WeekdayChips value={draft.weekdays} onChange={(weekdays) => set({ weekdays })} />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn primary" onClick={submit}>
          수정 저장
        </button>
        <button className="btn" onClick={onCancel}>
          취소
        </button>
      </div>
    </section>
  )
}

/* ---------- 목록 + 조립 ---------- */

export function Courses({
  courses,
  vacations,
  onChange,
}: {
  courses: Course[]
  vacations: Vacation[]
  onChange: (courses: Course[]) => void
}) {
  const [program, setProgram] = useState<Program>('term')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showTimetable, setShowTimetable] = useState(false)
  const editing = courses.find((c) => c.id === editingId)
  const shown = courses.filter((c) => programOf(c) === program)

  const remove = (course: Course) => {
    if (!window.confirm(`'${course.name}'을(를) 삭제할까요? 관련 계산에서 즉시 제외됩니다.`))
      return
    onChange(courses.filter((c) => c.id !== course.id))
    if (editingId === course.id) setEditingId(null)
  }

  return (
    <div className="stack">
      <div className="row spread">
        <nav className="subtabs" aria-label="강좌 구분">
        {PROGRAMS.map((p) => (
          <button
            key={p}
            className={program === p ? 'tab active' : 'tab'}
            onClick={() => {
              setProgram(p)
              setEditingId(null)
            }}
          >
            {PROGRAM_LABELS[p]} ({courses.filter((c) => programOf(c) === p).length})
          </button>
        ))}
        </nav>
        <button className="btn" onClick={() => setShowTimetable((v) => !v)}>
          운영계획서(hwpx)에서 가져오기
        </button>
      </div>

      {showTimetable && (
        <TimetableImport
          courses={courses}
          vacations={vacations}
          onChange={onChange}
          onClose={() => setShowTimetable(false)}
        />
      )}

      {editing ? (
        <EditCard
          course={editing}
          onSave={(updated) => {
            onChange(courses.map((c) => (c.id === updated.id ? updated : c)))
            setEditingId(null)
          }}
          onCancel={() => setEditingId(null)}
        />
      ) : (
        <BulkAdd
          key={program}
          program={program}
          courses={courses}
          vacations={vacations}
          onChange={onChange}
        />
      )}

      <section className="card">
        <h2>
          등록된 {PROGRAM_LABELS[program]}
          {program !== 'term' && ' 프로그램'} ({shown.length})
        </h2>
        {shown.length === 0 ? (
          <p className="hint">아직 등록된 항목이 없습니다.</p>
        ) : (
          <ul className="course-list">
            {shown.map((c) => (
              <li key={c.id} className="course-item">
                <div>
                  <strong>{c.name}</strong>
                  {c.instructor && <span className="muted"> · {c.instructor}</span>}
                  <div className="muted small-text">
                    {weekdaysLabel(c.weekdays)} · 회당 {c.hoursPerSession}시간 ×{' '}
                    {formatWon(c.hourlyRate)}
                    {c.travelPerDay ? ` · 교통비 ${formatWon(c.travelPerDay)}/일` : ''} ·{' '}
                    {c.startDate} ~ {c.endDate}
                  </div>
                </div>
                <div className="row">
                  <button className="btn small" onClick={() => setEditingId(c.id)}>
                    수정
                  </button>
                  <button className="btn small danger" onClick={() => remove(c)}>
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="hint">중도 폐강은 종료일을 앞당겨 처리하세요.</p>
      </section>
    </div>
  )
}
