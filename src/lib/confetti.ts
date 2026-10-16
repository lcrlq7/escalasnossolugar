/** Confete leve em CSS (sem dependências). */
export function confetti(count = 70) {
  if (typeof document === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const box = document.createElement('div')
  box.setAttribute('aria-hidden', 'true')
  box.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:200'
  const colors = ['#F9C700', '#FFE27A', '#2864C8', '#6EA0FA', '#4AC882', '#F56464', '#ffffff']
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span')
    const size = 6 + Math.random() * 8
    p.style.cssText = `position:absolute;top:-16px;left:${Math.random() * 100}%;width:${size}px;height:${size * (Math.random() > .5 ? 1 : .45)}px;background:${colors[i % colors.length]};border-radius:${Math.random() > .6 ? '50%' : '2px'};opacity:.95;animation:confetti-fall ${2.2 + Math.random() * 1.8}s cubic-bezier(.25,.6,.4,1) ${Math.random() * .6}s forwards;--dx:${(Math.random() - .5) * 240}px;--rot:${Math.random() * 900 - 450}deg`
    box.appendChild(p)
  }
  document.body.appendChild(box)
  setTimeout(() => box.remove(), 5000)
}
