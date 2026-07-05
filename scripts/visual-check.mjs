/**
 * Headless visual verification: drives the real app in Chromium, selects
 * regions through the dev store hook, and screenshots the rendered tint so
 * alignment can be judged against actual pixels (the layer the geometry
 * suites cannot see).
 *
 *     node scripts/visual-check.mjs [variant] [outDir]
 *
 * Requires the dev server on localhost:3000 and `npx playwright install
 * chromium`. Also relays [body-fit] console output and page errors.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const variant = process.argv[2] ?? "body-a";
const outDir = process.argv[3] ?? `scripts/out/shots-${variant}`;
const REGIONS = process.argv[4]
  ? process.argv[4].split(",")
  : [
      "neck.front",
      "shoulder.left",
      "torso.chest.left.anterior",
      "arm.elbow.left",
      "arm.fore.left",
      "torso.abdomen.lower.anterior",
      "torso.pelvis.anterior",
      "leg.upper.left",
    ];

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 480, height: 1000 },
  deviceScaleFactor: 2,
});
page.on("console", (message) => {
  const text = message.text();
  if (text.includes("body-fit") || message.type() === "error") {
    console.log(`BROWSER[${message.type()}]: ${text}`);
  }
});
page.on("pageerror", (error) => console.log(`PAGEERROR: ${error.message}`));

await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__wih !== undefined);
await page.evaluate((v) => window.__wih.getState().setBodyVariant(v), variant);
await page.waitForTimeout(3000); // glb load + first frames

await page.screenshot({ path: `${outDir}/_overview.png` });
for (const region of REGIONS) {
  await page.evaluate((id) => window.__wih.getState().selectRegion(id), region);
  await page.waitForTimeout(700); // tint fade-in + sheet settle
  await page.screenshot({ path: `${outDir}/${region.replaceAll(".", "_")}.png` });
}
await browser.close();
console.log(`screenshots written to ${outDir}`);
