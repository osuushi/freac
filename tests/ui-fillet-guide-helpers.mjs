export async function filletGuidePoint(page, fraction = 0.5) {
  return page.getByRole("button", { name: "Round corner", exact: true }).evaluate((path, t) => {
    const p = path.getPointAtLength(path.getTotalLength() * t);
    const m = path.getScreenCTM();
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  }, fraction);
}
export async function clickFilletGuide(page) {
  const point = await filletGuidePoint(page);
  await page.mouse.click(point.x, point.y);
}
