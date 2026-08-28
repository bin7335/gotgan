import { useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { HOLIDAY_RANGE_LABEL, KR_HOLIDAYS } from '../core/holidays'
import type { AppState } from '../core/types'
import { defaultState, exportJSON, parseImported } from '../storage'

export function SettingsView({
  state,
  patch,
  setState,
}: {
  state: AppState
  patch: (p: Partial<AppState>) => void
  setState: Dispatch<SetStateAction<AppState>>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [importMessage, setImportMessage] = useState('')

  const download = () => {
    const blob = new Blob([exportJSON(state)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `방과후곳간_백업_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importFile = async (file: File) => {
    try {
      const text = await file.text()
      const imported = parseImported(text)
      if (
        !window.confirm(
          '백업을 불러오면 현재 데이터를 완전히 대체합니다. 계속할까요?',
        )
      )
        return
      setState(imported)
      setImportMessage('백업을 불러왔습니다.')
    } catch (e) {
      setImportMessage(e instanceof Error ? e.message : '파일을 읽지 못했습니다.')
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>기본 정보</h2>
        <div className="field-grid">
          <label>
            학교명 (선택)
            <input
              type="text"
              value={state.settings.schoolName ?? ''}
              onChange={(e) =>
                patch({ settings: { ...state.settings, schoolName: e.target.value || undefined } })
              }
            />
          </label>
          <label>
            학기 표시 (선택)
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
        <div className="row">
          <button className="btn" onClick={() => patch({ setupDone: false })}>
            설정 절차 다시 진행 (데이터 유지)
          </button>
        </div>
      </section>

      <section className="card">
        <h2>공휴일 자동 휴강</h2>
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
        {state.settings.disabledHolidays.length > 0 && (
          <>
            <h3>수업일로 해제한 공휴일</h3>
            <ul>
              {state.settings.disabledHolidays.map((d) => (
                <li key={d} className="row spread">
                  <span>
                    {d} {KR_HOLIDAYS[d] ?? ''}
                  </span>
                  <button
                    className="btn small"
                    onClick={() =>
                      patch({
                        settings: {
                          ...state.settings,
                          disabledHolidays: state.settings.disabledHolidays.filter(
                            (x) => x !== d,
                          ),
                        },
                      })
                    }
                  >
                    자동 휴강 복원
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="hint">
          개별 공휴일의 해제는 캘린더에서 해당 날짜를 눌러 처리할 수 있습니다.
        </p>
      </section>

      <section className="card">
        <h2>백업과 복원</h2>
        <div className="row">
          <button className="btn" onClick={download}>
            JSON으로 내보내기
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            백업 불러오기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importFile(f)
              e.target.value = ''
            }}
          />
        </div>
        {importMessage && <p className="hint">{importMessage}</p>}
        <p className="hint">
          데이터는 이 브라우저에만 저장됩니다. 기기를 바꾸거나 업무를 인수인계할 때는 내보내기
          파일을 전달하세요.
        </p>
      </section>

      <section className="card">
        <h2>초기화</h2>
        <button
          className="btn danger"
          onClick={() => {
            if (
              window.confirm(
                '모든 데이터(예산·강좌·휴강일)를 삭제합니다. 되돌릴 수 없습니다. 계속할까요?',
              )
            )
              setState(defaultState())
          }}
        >
          모든 데이터 삭제
        </button>
      </section>
    </div>
  )
}
