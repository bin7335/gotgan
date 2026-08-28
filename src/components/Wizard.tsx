import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { formatWon, type Projection } from '../core/calc'
import type { AppState, ISODate } from '../core/types'
import { sampleState } from '../storage'
import { BudgetImport } from './BudgetImport'
import { ClosedDays } from './ClosedDays'
import { Courses } from './Courses'
import { MoneyInput } from './fields'

const STEPS = ['학교 정보', '예산', '강좌', '휴강일·방학', '확인'] as const

export function Wizard({
  state,
  patch,
  setState,
  projection,
  baseDate,
}: {
  state: AppState
  patch: (p: Partial<AppState>) => void
  setState: Dispatch<SetStateAction<AppState>>
  projection: Projection
  baseDate: ISODate
}) {
  const [step, setStep] = useState(0)
  const [showImport, setShowImport] = useState(false)
  const last = STEPS.length - 1

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>방과후 곳간</h1>
          <p className="app-sub">처음 설정 — 순서대로 입력하면 추경 예상액이 계산됩니다</p>
        </div>
      </header>

      <nav className="wizard-steps" aria-label="설정 단계">
        {STEPS.map((label, i) => (
          <button
            key={label}
            className={['wstep', i === step ? 'current' : '', i < step ? 'done' : ''].join(' ')}
            onClick={() => setStep(i)}
          >
            <span className="wstep-no">{i + 1}</span>
            {label}
          </button>
        ))}
      </nav>

      <main className="stack">
        {step === 0 && (
          <section className="card">
            <h2>1. 학교 정보</h2>
            <div className="field-grid">
              <label>
                학교명
                <input
                  type="text"
                  value={state.settings.schoolName ?? ''}
                  placeholder="예: ○○초등학교"
                  onChange={(e) =>
                    patch({
                      settings: { ...state.settings, schoolName: e.target.value || undefined },
                    })
                  }
                />
              </label>
              <label>
                학기
                <input
                  type="text"
                  value={state.settings.semesterLabel ?? ''}
                  placeholder="예: 2026학년도 2학기"
                  onChange={(e) =>
                    patch({
                      settings: { ...state.settings, semesterLabel: e.target.value || undefined },
                    })
                  }
                />
              </label>
            </div>
            <p className="hint">
              보고서 제목에 쓰입니다. 먼저 화면만 둘러보려면{' '}
              <button className="btn small" onClick={() => setState(sampleState())}>
                예시 데이터로 살펴보기
              </button>
            </p>
          </section>
        )}

        {step === 1 && (
          <>
            <section className="card">
              <h2>2. 예산</h2>
              <p className="hint">
                K-에듀파인 세출예산집행현황 엑셀을 올리면 자동으로 채워집니다. 파일이 없으면 직접
                입력하세요.
              </p>
              <div className="row">
                <button className="btn primary" onClick={() => setShowImport((v) => !v)}>
                  세출예산 엑셀에서 가져오기
                </button>
                {state.importMemo && (
                  <span className="muted small-text">
                    마지막 가져오기: {state.importMemo.fileName}
                  </span>
                )}
              </div>
              <div className="field-grid" style={{ marginTop: '0.85rem' }}>
                <label>
                  기정예산 (원)
                  <MoneyInput
                    value={state.budget.allocated}
                    onChange={(allocated) => patch({ budget: { ...state.budget, allocated } })}
                  />
                </label>
                <label>
                  현재까지 집행액 (원)
                  <MoneyInput
                    value={state.budget.executed}
                    onChange={(executed) => patch({ budget: { ...state.budget, executed } })}
                  />
                </label>
              </div>
              <p className="hint">
                집행액은 <strong>기준일 전날까지 지급 완료된 금액</strong> 기준입니다.
              </p>
            </section>
            {showImport && (
              <BudgetImport state={state} patch={patch} onClose={() => setShowImport(false)} />
            )}
          </>
        )}

        {step === 2 && (
          <Courses
            courses={state.courses}
            vacations={state.vacations}
            onChange={(courses) => patch({ courses })}
          />
        )}

        {step === 3 && <ClosedDays state={state} patch={patch} />}

        {step === 4 && (
          <>
            <section
              className={`card hero ${projection.delta >= 0 ? 'hero-return' : 'hero-need'}`}
            >
              <p className="hero-label">
                {projection.delta >= 0 ? '추경 반납(감액) 예상액' : '추경 증액 필요액'}
              </p>
              <p className="hero-value">{formatWon(Math.abs(projection.delta))}</p>
              <p className="hero-sub">
                {baseDate} 기준 · 잔액 {formatWon(projection.balance)} − 잔여 예상 지출{' '}
                {formatWon(projection.remaining)} · 강좌 {state.courses.length}개 · 휴강일{' '}
                {state.closedDays.length}건
              </p>
            </section>
            <section className="card">
              <h2>5. 확인</h2>
              <p>
                설정이 끝났습니다. 완료를 누르면 대시보드로 이동하며, 이후에는 어느 탭에서든
                자유롭게 수정할 수 있습니다. 수정할 내용이 보이면 위 단계 번호를 눌러 돌아가세요.
              </p>
            </section>
          </>
        )}
      </main>

      <footer className="wizard-footer">
        <button className="btn" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          ← 이전
        </button>
        {step < last ? (
          <button className="btn primary" onClick={() => setStep((s) => s + 1)}>
            다음 →
          </button>
        ) : (
          <button className="btn primary" onClick={() => patch({ setupDone: true })}>
            설정 완료 — 대시보드 보기
          </button>
        )}
      </footer>
    </div>
  )
}
