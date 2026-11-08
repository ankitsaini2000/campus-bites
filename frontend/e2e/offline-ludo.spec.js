import { test, expect } from "@playwright/test";

/**
 * Offline Ludo overlay.
 *
 * When the browser goes offline, the open app turns into the Campus Bites
 * Ludo game; when the connection returns, the dashboard comes back untouched.
 * The game runs entirely client-side (bots only need the page itself), so
 * Playwright's setOffline() exercises the real behavior.
 */

const API = "http://127.0.0.1:5000/api";

/** Register + login a student through the API, returning { name, token }. */
let studentCounter = 0;
async function createStudent() {
  studentCounter += 1;
  const name = `E2E Offline ${studentCounter}`;
  const email = `${2400520100300 + studentCounter}@ietlucknow.ac.in`;
  const password = "studentpass123";
  const headers = { "Content-Type": "application/json" };
  const body = JSON.stringify({ name, email, password });
  const signup = await fetch(`${API}/auth/signup`, { method: "POST", headers, body });
  if (!signup.ok && signup.status !== 409) throw new Error(`signup failed: ${signup.status}`);
  const login = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status}`);
  return { name, token: (await login.json()).token };
}

test("going offline swaps the dashboard for Ludo; going online restores it", async ({ page }) => {
  const student = await createStudent();
  await page.addInitScript((token) => localStorage.setItem("token", token), student.token);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(student.name);

  // Net drops -> the Ludo overlay takes over the screen.
  await page.context().setOffline(true);
  const game = page.getByTestId("offline-ludo");
  await expect(game).toBeVisible();

  // The game is playable offline: configure + roll.
  await game.getByRole("button", { name: "Start game" }).click();
  await game.getByTestId("ludo-roll").click();
  await expect(page.getByTestId("ludo-msg")).toContainText(/rolled/i, { timeout: 10_000 });

  // Net returns -> the game yields the dashboard back untouched.
  await page.context().setOffline(false);
  await expect(page.getByTestId("offline-ludo")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(student.name);
});

test("no Ludo overlay while online", async ({ page }) => {
  const student = await createStudent();
  await page.addInitScript((token) => localStorage.setItem("token", token), student.token);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(student.name);
  await expect(page.getByTestId("offline-ludo")).toHaveCount(0);
});

test("after the app is cached, an offline reload shows the Ludo game", async ({ page }) => {
  const student = await createStudent();
  await page.addInitScript((token) => localStorage.setItem("token", token), student.token);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(student.name);

  // Wait for the service worker to take control, then reload once online so
  // the app shell is served and cached under the worker. After that, an
  // offline reload boots from cache.
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(student.name);
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 15_000 });

  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByTestId("offline-ludo")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("offline-ludo").getByRole("button", { name: "Start game" }).click();
  await page.getByTestId("ludo-roll").click();
  await expect(page.getByTestId("ludo-msg")).toContainText(/rolled/i, { timeout: 10_000 });

  await page.context().setOffline(false);
  await expect(page.getByTestId("offline-ludo")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(student.name);
});
