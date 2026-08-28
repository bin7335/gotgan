import { useEffect, useMemo, useState } from 'react'
import { collectWarnings, projectAll } from './core/calc'
import { todayISO } from './core/date'
import { holidayClosures } from './core/holidays'
import type { AppState } from './core/types'
import { loadState, sampleState, saveState } from './storage'
import { ClosedDays } from './components/ClosedDays'
import { Courses } from './components/Courses'
import { Dashboard } from './components/Dashboard'
import { Report } from './components/Report'
import { SettingsView } from './components/SettingsView'
import { Wizard } from './components/Wizard'

export type Tab = 'dash' | 'courses' | 'closed' | 'report' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'dash', label: '대시보드' },
  { id: 'courses', label: '강좌' },
  { id: 'closed', label: '휴강일' },
  { id: 'report', label: '보고서' },
  { id: 'settings', label: '설정' },
]

export default function App() {
  // ?sample = 예시 데이터로 시작 (시연·공유용), ?setup = 설정 절차 강제 진입
  const [state, setState] = useState<AppState>(() => {
    const params = new URLSearchParams(window.location.search)
    const s = params.has('sample') ? sampleState() : loadState()
    return params.has('setup') ? { ...s, setupDone: false } : s
  })
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    return TABS.some((x) => x.id === t) ? (t as Tab) : 'dash'
  })

  useEffect(() => {
    saveState(state)
  }, [state])

  const patch = (p: Partial<AppState>) => setState((s) => ({ ...s, ...p }))

  const baseDate = state.baseDate ?? todayISO()

  const effectiveClosures = useMemo(
    () =>
      state.settings.autoHolidays
        ? [...state.closedDays, ...holidayClosures(state.settings.disabledHolidays)]
        : state.closedDays,
    [state.closedDays, state.settings.autoHolidays, state.settings.disabledHolidays],
  )

  const projection = useMemo(
    () => projectAll(state.courses, effectiveClosures, state.budget, baseDate, state.vacations),
    [state.courses, effectiveClosures, state.budget, baseDate, state.vacations],
  )

  const warnings = useMemo(
    () => collectWarnings(state.courses, effectiveClosures),
    [state.courses, effectiveClosures],
  )

  if (!state.setupDone) {
    return (
      <Wizard
        state={state}
        patch={patch}
        setState={setState}
        projection={projection}
        baseDate={baseDate}
      />
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>방과후 곳간</h1>
          <p className="app-sub">
            {[state.settings.schoolName, state.settings.semesterLabel].filter(Boolean).join(' · ') ||
              '방과후학교 강사비 예산 계산기'}
          </p>
        </div>
        <nav className="tabs" aria-label="주요 화면">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'tab active' : 'tab'}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              {t.label}
            </button>
          ))}
          <button
            className="tab restart"
            title="처음 설정 절차를 다시 진행합니다 (데이터는 유지됩니다)"
            onClick={() => patch({ setupDone: false })}
          >
            ↺ 설정 다시하기
          </button>
        </nav>
      </header>

      <main>
        {tab === 'dash' && (
          <Dashboard
            state={state}
            projection={projection}
            warnings={warnings}
            baseDate={baseDate}
            patch={patch}
            setState={setState}
            goTo={setTab}
          />
        )}
        {tab === 'courses' && (
          <Courses
            courses={state.courses}
            vacations={state.vacations}
            onChange={(courses) => patch({ courses })}
          />
        )}
        {tab === 'closed' && <ClosedDays state={state} patch={patch} />}
        {tab === 'report' && <Report state={state} projection={projection} baseDate={baseDate} />}
        {tab === 'settings' && <SettingsView state={state} patch={patch} setState={setState} />}
      </main>

      <footer className="app-footer">
        데이터는 이 브라우저에만 저장됩니다 · 기기 변경 전에 설정에서 백업하세요
      </footer>
    </div>
  )
}
