export function MarqueeOverlay({
  box,
}: {
  box: { a: { x: number; y: number }; b: { x: number; y: number } } | null
}) {
  if (!box) return null
  const minX = Math.min(box.a.x, box.b.x)
  const minY = Math.min(box.a.y, box.b.y)
  const w = Math.abs(box.a.x - box.b.x)
  const h = Math.abs(box.a.y - box.b.y)
  return (
    <div
      className="marquee-rect"
      style={{
        position: 'fixed',
        left: minX,
        top: minY,
        width: w,
        height: h,
      }}
    />
  )
}
