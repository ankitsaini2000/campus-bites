import { test, expect } from "@playwright/test";

/**
 * Session-check hardening.
 *
 * When the backend is unreachable (Render cold start, network drop), the app
 * used to hang forever on the "Warming up the kitchen..." splash because the
 * /auth/me request never settled. These tests pin the fixed behavior:
 * a retry screen appears, the stored token survives network failures, and a
 * successful retry lands the user back on their dashboard.
 */

const API = "http://127.0.0.1:5000/api";

/** Register + login a brand-new student through the API, return { name, email, password, token }. */
let studentCounter = 0;
async function createStudent() {
  studentCounter += 1;
  const name = "E2E Session 1";
  // The campus gate only accepts 13-digit IET roll numbers
  // (2400520100 + three digits) at @ietlucknow.ac.in.
  const email = `${2400520100100 + studentCounter}@ietlucknow.ac.in`;
  const password = "studentpass123";
  const headers = { "Content-Type": "application/json" };
  const body = JSON.stringify({ name, email, password });
  const signup = await fetch(`${API}/auth/signup`, { method: "POST", headers, body });
  if (!signup.ok && signup.status !== 409) throw new Error(`signup failed: ${signup.status}`);
  const login = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status}`);
  const { token } = await login.json();
  return { name, email, password, token };
}

test("a hung /auth/me shows the retry screen and keeps the stored token", async ({ page }) => {
  const student = await createStudent();
  await page.addInitScript((token) => localStorage.setItem("token", token), student.token);
  await page.route("**/api/auth/me", (route) => route.abort());
  await page.goto("/");

  await expect(page.getByText("Can't reach the kitchen")).toBeVisible({ timeout: 30_000 });

  const stored = await page.evaluate(() => localStorage.getItem("token"));
  expect(stored).toBe(student.token);
  // Login and splash must both stay out of the way.
  await expect(page.getByPlaceholder("Email")).toHaveCount(0);
});

test("retry succeeds and returns the user to their dashboard", async ({ page }) => {
  const student = await createStudent();
  await page.addInitScript((token) => localStorage.setItem("token", token), student.token);
  await page.route("**/api/auth/me", (route) => route.abort());
  await page.goto("/");

  await expect(page.getByText("Can't reach the kitchen")).toBeVisible({ timeout: 30_000 });

  await page.unroute("**/api/auth/me");
  await page.getByRole("button", { name: /retry/i }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(student.name, {
    timeout: 20_000,
  });

  const stored = await page.evaluate(() => localStorage.getItem("token"));
  expect(stored).toBe(student.token);
});
