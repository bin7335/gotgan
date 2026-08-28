import { useMemo, useRef, useState } from 'react'
import { formatWon } from '../core/calc'
import { todayISO } from '../core/date'
import { isRelevant, parseBudgetRows, suggestKind, type BudgetRow } from '../core/eduimport'
import {
  CATEGORY_LABELS,
  type AppState,
  type BudgetCategory,
  type CategoryKind,
} from '../core/types'

const KINDS = Object.keys(CATEGORY_LABELS) as CategoryKind[]

interface Pick {
  checked: boolean
  kind: CategoryKind
}

export function BudgetImport({
  state,
  patch,
  onClose,
}: {
  state: AppState
  patch: (p: Partial<AppState>) => void
  onClose: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<BudgetRow[]>([])
  const [picks, setPicks] = useState<Map<string, Pick>>(new Map())
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [rematched, setRematched] = useState(0)

  const loadFile = async (file: File) => {
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
      const parsed = parseBudgetRows(raw)

      // 이전 선택 기억으로 자동 재매칭 (키 우선, 없으면 산출내역 이름)
      const memo = state.importMemo?.selections ?? []
      const byKey = new Map(memo.map((s) => [s.key, s]))
      const byName = new Map(memo.map((s) => [s.name, s]))
      let hit = 0
      const next = new Map<string, Pick>()
      for (const r of parsed) {
        const m = byKey.get(r.key) ?? byName.get(r.name)
        if (m) hit++
        next.set(r.key, { checked: !!m, kind: m?.kind ?? suggestKind(r) })
      }
      setRows(parsed)
      setPicks(next)
      setRematched(hit)
      setFileName(file.name)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일을 읽지 못했습니다.')
    }
  }

  const setPick = (key: string, p: Partial<Pick>) =>
    setPicks((m) => {
      const next = new Map(m)
      next.set(key, { ...next.get(key)!, ...p })
      return next
    })

  const relevant = useMemo(() => rows.filter(isRelevant), [rows])
  const others = useMemo(() => {
    const rest = rows.filter((r) => !isRelevant(r))
    const q = search.trim()
    return q ? rest.filter((r) => [...r.path, r.account, r.name].join(' ').includes(q)) : rest
  }, [rows, search])

  const selected = rows.filter((r) => picks.get(r.key)?.checked)
  const sums = new Map<CategoryKind, { allocated: number; executed: number }>()
  for (const r of selected) {
    const kind = picks.get(r.key)!.kind
    const s = sums.get(kind) ?? { allocated: 0, executed: 0 }
    s.allocated += r.allocated
    s.executed += r.executed
    sums.set(kind, s)
  }

  const apply = () => {
    if (selected.length === 0) {
      setError('가져올 항목을 하나 이상 체크하세요.')
      return
    }
    const prev = new Map((state.categories ?? []).map((c) => [c.kind, c]))
    const categories: BudgetCategory[] = KINDS.filter((k) => sums.has(k)).map((k) => ({
      kind: k,
      allocated: sums.get(k)!.allocated,
      executed: sums.get(k)!.executed,
      manualRemaining: prev.get(k)?.manualRemaining,
    }))
    const lesson = sums.get('lesson') ?? { allocated: 0, executed: 0 }
    const travel = sums.get('travel') ?? { allocated: 0, executed: 0 }
    // 산출내역별 추경 예상용 라인. 사라진 라인의 강좌 연결·수동 입력은 정리한다.
    const budgetLines = selected.map((r) => ({
      key: r.key,
      name: r.name,
      kind: picks.get(r.key)!.kind,
      allocated: r.allocated,
      executed: r.executed,
    }))
    const liveKeys = new Set(budgetLines.map((l) => l.key))
    const lineAssignments = Object.fromEntries(
      Object.entries(state.lineAssignments ?? {}).filter(([k]) => liveKeys.has(k)),
    )
    const lineManuals = Object.fromEntries(
      Object.entries(state.lineManuals ?? {}).filter(([k]) => liveKeys.has(k)),
    )
    patch({
      categories,
      budgetLines,
      lineAssignments,
      lineManuals,
      // 기본 예산(Δ 히어로)은 자동 산출과 짝이 맞는 강사비+교통비 유목으로 설정
      budget: {
        allocated: lesson.allocated + travel.allocated,
        executed: lesson.executed + travel.executed,
      },
      importMemo: {
        fileName,
        importedAt: todayISO(),
        selections: selected.map((r) => ({ key: r.key, name: r.name, kind: picks.get(r.key)!.kind })),
      },
    })
    onClose()
  }

  const rowLine = (r: BudgetRow) => {
    const p = picks.get(r.key)!
    return (
      <tr key={r.key} className={p.checked ? undefined : 'muted'}>
        <td>
          <input
            type="checkbox"
            checked={p.checked}
            aria-label={`${r.name} 선택`}
            onChange={(e) => setPick(r.key, { checked: e.target.checked })}
          />
        </td>
        <td>
          {r.name}
          <div className="muted small-text">
            {r.path.join(' › ')} · {r.account}
          </div>
        </td>
        <td className="num">{formatWon(r.allocated)}</td>
        <td className="num">{formatWon(r.executed)}</td>
        <td>
          <select
            value={p.kind}
            aria-label="유목"
            onChange={(e) => setPick(r.key, { kind: e.target.value as CategoryKind })}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {CATEGORY_LABELS[k]}
              </option>
            ))}
          </select>
        </td>
      </tr>
    )
  }

  return (
    <section className="card onboarding">
      <div className="row spread">
        <h2>세출예산 엑셀 가져오기</h2>
        <button className="btn small" onClick={onClose}>
          닫기
        </button>
      </div>
      <p className="hint">
        K-에듀파인의 <strong>세출예산집행현황목록</strong>(엑셀)을 올리면 방과후 관련 항목을 추려
        보여줍니다. 해당 예산을 체크하고 유목(강사비/교통비/재료비/기타)을 확인하면, 유목별
        예산현액·원인행위액이 자동 입력됩니다. 파일은 이 브라우저 안에서만 처리됩니다.
      </p>
      <div className="row">
        <button className="btn primary" onClick={() => fileRef.current?.click()}>
          엑셀 파일 선택 (.xls/.xlsx/.csv)
        </button>
        {fileName && <span className="muted small-text">{fileName}</span>}
        <input
          ref={fileRef}
          type="file"
          accept=".xls,.xlsx,.csv"
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

      {rows.length > 0 && (
        <>
          {rematched > 0 && (
            <p className="hint">지난번 선택 {rematched}개 항목을 자동으로 다시 체크했습니다.</p>
          )}
          <h3>추천 항목 ({relevant.length}) — 방과후·강사·재료·교통 키워드</h3>
          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>산출내역</th>
                  <th className="num">예산현액</th>
                  <th className="num">원인행위액</th>
                  <th>유목</th>
                </tr>
              </thead>
              <tbody>{relevant.map(rowLine)}</tbody>
            </table>
          </div>

          <details>
            <summary>나머지 항목에서 찾기 ({rows.length - relevant.length})</summary>
            <div className="row" style={{ margin: '0.5rem 0' }}>
              <input
                type="text"
                placeholder="산출내역·사업명 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="tablewrap">
              <table className="data">
                <tbody>{others.map(rowLine)}</tbody>
              </table>
            </div>
          </details>

          <h3>선택 요약 ({selected.length}개 항목)</h3>
          <ul>
            {KINDS.filter((k) => sums.has(k)).map((k) => (
              <li key={k}>
                <strong>{CATEGORY_LABELS[k]}</strong>: 예산현액 {formatWon(sums.get(k)!.allocated)}{' '}
                · 원인행위액 {formatWon(sums.get(k)!.executed)}
              </li>
            ))}
          </ul>
          <p className="hint">
            집행 금액은 파일의 <strong>원인행위액(계약·품의 확정액)</strong> 기준입니다. 실제 지급
            완료액과 다를 수 있으니 필요하면 가져온 뒤 집행액을 직접 조정하세요.
          </p>
          <div className="row">
            <button className="btn primary" onClick={apply}>
              선택한 항목으로 예산 설정
            </button>
          </div>
        </>
      )}
    </section>
  )
}
