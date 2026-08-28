import { useEffect, useState } from 'react'

/** 원 단위 금액 입력. 쉼표 표기를 유지하면서 숫자만 상태로 넘긴다. */
export function MoneyInput({
  value,
  onChange,
  id,
  placeholder,
  ariaLabel,
}: {
  value: number
  onChange: (n: number) => void
  id?: string
  placeholder?: string
  ariaLabel?: string
}) {
  const [text, setText] = useState(value ? value.toLocaleString('ko-KR') : '')

  useEffect(() => {
    setText(value ? value.toLocaleString('ko-KR') : '')
  }, [value])

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      className="money"
      value={text}
      placeholder={placeholder ?? '0'}
      aria-label={ariaLabel}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, '')
        const n = digits ? Number(digits) : 0
        setText(digits ? n.toLocaleString('ko-KR') : '')
        onChange(n)
      }}
    />
  )
}
