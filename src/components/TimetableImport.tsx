import { useMemo, useRef, useState } from 'react'
import { addDays, todayISO } from '../core/date'
import {
  classifyTable,
  diffCourses,
  extractCourses,
  parseHwpxSection,
  type ExtractedCourse,
  type HwpxTable,
} from '../core/hwpximport'
import { weekdaysLabel } from '../core/calc'
import {
  DEFAULT_HOURLY_RATE,
  SEASON_LABELS,
  type Course,
  type Vacation,
} from '../core/types'
import { MoneyInput } from './fields'

type Program = 'term' | 'summer' | 'winter'
type TableProgram = Program | 'skip'

const PROGRAM_LABELS: Record<Program, string> = { term: '학기중', ...SEASON_LABELS }

interface LoadedTable {
  table: HwpxTable
  shape: ReturnType<typeof classifyTable>
  extracted: ExtractedCourse[]
  program: TableProgram
}

const programOf = (c: Course): Program => c.program ?? 'term'

function guessProgram(heading: string): TableProgram {
  if (heading.includes('여름')) return 'summer'
  if (heading.includes('겨울')) return 'winter'
  if (heading.includes('방학')) return 'winter'
  return 'term'
}

export function TimetableImport({
  courses,
  vacations,
  onChange,
  onClose,
}: {
  courses: Course[]
  vacations: Vacation[]
  onChange: (courses: Course[]) => void
  onClose: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [tables, setTables] = useState<LoadedTable[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set()) // 신규/변경/폐강 체크 키
  const [rate, setRate] = useState(DEFAULT_HOURLY_RATE)
  const [dates, setDates] = useState<Record<Program, { start: string; end: string }>>({
    term: { start: '', end: '' },
    summer: {
      start: vacations.find((v) => v.season === 'summer')?.startDate ?? '',
      end: vacations.find((v) => v.season === 'summer')?.endDate ?? '',
    },
    winter: {
      start: vacations.find((v) => v.season === 'winter')?.startDate ?? '',
      end: vacations.find((v) => v.season === 'winter')?.endDate ?? '',
    },
  })
  const [error, setError] = useState('')

  const loadFile = async (file: File) => {
    try {
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(await file.arrayBuffer())
      const sections = zip.file(/Contents\/section\d+\.xml/).sort((a, b) =>
        a.name < b.name ? -1 : 1,
      )
      if (sections.length === 0) {
        setError('hwpx 본문을 찾지 못했습니다. 한글에서 hwpx 형식으로 저장한 파일인지 확인하세요.')
        return
      }
      const parsed: LoadedTable[] = []
      for (const s of sections) {
        for (const table of parseHwpxSection(await s.async('string'))) {
          const shape = classifyTable(table)
          const extracted = extractCourses(table)
          parsed.push({
            table,
            shape,
            extracted,
            program: extracted.length > 0 ? guessProgram(table.heading) : 'skip',
          })
        }
      }
      if (parsed.every((t) => t.extracted.length === 0)) {
        setError('시간표로 인식되는 표를 찾지 못했습니다.')
        return
      }
      setTables(parsed)
      // 기본 선택: 신규·변경은 켜고, 폐강 후보는 끈다
      const init = new Set<string>()
      parsed.forEach((t, i) => {
        if (t.program === 'skip') return
        const diff = diffCourses(t.extracted, courses.filter((c) => programOf(c) === t.program))
        diff.added.forEach((a) => init.add(`add:${i}:${a.name}`))
        diff.changed.forEach((c) => init.add(`chg:${i}:${c.course.id}`))
      })
      setChecked(init)
      setFileName(file.name)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일을 읽지 못했습니다.')
    }
  }

  const toggle = (key: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  const diffs = useMemo(
    () =>
      tables.map((t, i) =>
        t.program === 'skip'
          ? null
          : {
              index: i,
              program: t.program,
              diff: diffCourses(t.extracted, courses.filter((c) => programOf(c) === t.program)),
            },
      ),
    [tables, courses],
  )

  const apply = () => {
    const addedPrograms = new Set<Program>()
    for (const d of diffs) {
      if (!d) continue
      for (const a of d.diff.added) {
        if (checked.has(`add:${d.index}:${a.name}`)) addedPrograms.add(d.program)
      }
    }
    for (const p of addedPrograms) {
      if (!dates[p].start || !dates[p].end || dates[p].start > dates[p].end) {
        setError(`${PROGRAM_LABELS[p]} 신규 강좌의 운영 시작일·종료일을 입력하세요.`)
        return
      }
    }
    setError('')

    let next = [...courses]
    const yesterday = addDays(todayISO(), -1)
    for (const d of diffs) {
      if (!d) continue
      for (const a of d.diff.added) {
        if (!checked.has(`add:${d.index}:${a.name}`)) continue
        next.push({
          id: crypto.randomUUID(),
          name: a.name,
          instructor: a.instructor,
          program: d.program,
          weekdays: a.weekdays,
          hoursPerSession: a.hoursPerSession,
          hourlyRate: rate,
          startDate: dates[d.program].start,
          endDate: dates[d.program].end,
        })
      }
      for (const c of d.diff.changed) {
        if (!checked.has(`chg:${d.index}:${c.course.id}`)) continue
        next = next.map((x) =>
          x.id === c.course.id
            ? {
                ...x,
                weekdays: c.next.weekdays,
                hoursPerSession: c.next.hoursPerSession,
                instructor: c.next.instructor ?? x.instructor,
              }
            : x,
        )
      }
      for (const miss of d.diff.missing) {
        if (!checked.has(`del:${d.index}:${miss.id}`)) continue
        next = next.map((x) =>
          x.id === miss.id && x.endDate > yesterday ? { ...x, endDate: yesterday } : x,
        )
      }
    }
    onChange(next)
    onClose()
  }

  return (
    <section className="card onboarding">
      <div className="row spread">
        <h2>운영계획서(hwpx)에서 시간표 가져오기</h2>
        <button className="btn small" onClick={onClose}>
          닫기
        </button>
      </div>
      <p className="hint">
        운영계획서의 시간표를 읽어 강좌 목록을 현행화합니다. 표마다 학기중/방학 구분을 확인하고,
        신규·변경·폐강 후보를 체크로 결정하세요. 파일은 이 브라우저 안에서만 처리됩니다.
      </p>
      <div className="row">
        <button className="btn primary" onClick={() => fileRef.current?.click()}>
          hwpx 파일 선택
        </button>
        {fileName && <span className="muted small-text">{fileName}</span>}
        <input
          ref={fileRef}
          type="file"
          accept=".hwpx"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) loadFile(f)
            e.target.value = ''
          }}
        />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {tables.length > 0 && (
        <>
          {tables.map((t, i) => (
            <div key={i} className="import-table">
              <div className="row wrap">
                <strong>
                  표 {i + 1}. {t.table.heading || '(제목 없음)'}
                </strong>
                <span className="muted small-text">
                  {t.shape === 'grid' ? '격자형' : t.shape === 'list' ? '목록형' : '인식 안 됨'} ·
                  강좌 {t.extracted.length}개
                </span>
                <select
                  value={t.program}
                  aria-label="구분"
                  onChange={(e) =>
                    setTables((ts) =>
                      ts.map((x, j) =>
                        j === i ? { ...x, program: e.target.value as TableProgram } : x,
                      ),
                    )
                  }
                >
                  <option value="term">학기중</option>
                  <option value="summer">여름방학</option>
                  <option value="winter">겨울방학</option>
                  <option value="skip">가져오지 않음</option>
                </select>
              </div>

              {t.program !== 'skip' && diffs[i] && (
                <DiffView
                  index={i}
                  diff={diffs[i]!.diff}
                  checked={checked}
                  toggle={toggle}
                />
              )}
            </div>
          ))}

          <h3>신규 강좌 공통 설정</h3>
          <div className="field-grid">
            <label>
              시간당 단가 (원)
              <MoneyInput value={rate} onChange={setRate} />
            </label>
            {(['term', 'summer', 'winter'] as Program[]).map((p) => (
              <label key={p}>
                {PROGRAM_LABELS[p]} 운영 기간
                <span className="row">
                  <input
                    type="date"
                    value={dates[p].start}
                    onChange={(e) =>
                      setDates((d) => ({ ...d, [p]: { ...d[p], start: e.target.value } }))
                    }
                  />
                  ~
                  <input
                    type="date"
                    value={dates[p].end}
                    onChange={(e) =>
                      setDates((d) => ({ ...d, [p]: { ...d[p], end: e.target.value } }))
                    }
                  />
                </span>
              </label>
            ))}
          </div>
          <p className="hint">
            시수는 하루 교시 수 기준으로 읽습니다(1교시 = 1시수). 계획서에 없는 정보(단가·교통비)는
            신규 강좌에 공통 단가를 적용하고, 기존 강좌는 그대로 둡니다.
          </p>
          <div className="row">
            <button className="btn primary" onClick={apply}>
              체크한 내용으로 현행화
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function DiffView({
  index,
  diff,
  checked,
  toggle,
}: {
  index: number
  diff: ReturnType<typeof diffCourses>
  checked: Set<string>
  toggle: (key: string, on: boolean) => void
}) {
  return (
    <div className="stack" style={{ gap: '0.5rem', marginTop: '0.5rem' }}>
      {diff.added.length > 0 && (
        <div>
          <h3>신규 ({diff.added.length})</h3>
          {diff.added.map((a) => {
            const key = `add:${index}:${a.name}`
            return (
              <label key={key} className="inline">
                <input
                  type="checkbox"
                  checked={checked.has(key)}
                  onChange={(e) => toggle(key, e.target.checked)}
                />
                {a.name} — {weekdaysLabel(a.weekdays)} · {a.hoursPerSession}교시
                {a.instructor ? ` · ${a.instructor}` : ''}
              </label>
            )
          })}
        </div>
      )}
      {diff.changed.length > 0 && (
        <div>
          <h3>변경 ({diff.changed.length})</h3>
          {diff.changed.map((c) => {
            const key = `chg:${index}:${c.course.id}`
            return (
              <label key={key} className="inline">
                <input
                  type="checkbox"
                  checked={checked.has(key)}
                  onChange={(e) => toggle(key, e.target.checked)}
                />
                {c.course.name} — {c.notes.join('·')} 변경:{' '}
                {weekdaysLabel(c.course.weekdays)} {c.course.hoursPerSession}교시 →{' '}
                {weekdaysLabel(c.next.weekdays)} {c.next.hoursPerSession}교시
              </label>
            )
          })}
        </div>
      )}
      {diff.missing.length > 0 && (
        <div>
          <h3 className="muted">시간표에 없음 — 폐강 확인 ({diff.missing.length})</h3>
          {diff.missing.map((m) => {
            const key = `del:${index}:${m.id}`
            return (
              <label key={key} className="inline">
                <input
                  type="checkbox"
                  checked={checked.has(key)}
                  onChange={(e) => toggle(key, e.target.checked)}
                />
                {m.name} — 체크하면 종료일을 어제로 앞당깁니다 (삭제하지 않음)
              </label>
            )
          })}
        </div>
      )}
      {diff.added.length === 0 && diff.changed.length === 0 && diff.missing.length === 0 && (
        <p className="hint">기존 강좌 목록과 완전히 일치합니다.</p>
      )}
    </div>
  )
}
