import { test, expect } from "@playwright/test";

for (const filtered of [false, true]) {
  test(`Approve All respects the visible page${filtered ? " and user filter" : ""}`, async ({ page }) => {
    const requests = [];
    const users = [{ id: "a", name: "Alice", email: "a@test.test" }, { id: "b", name: "Bob", email: "b@test.test" }];
    let approved = false;
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      let body = { items: [], total: 0 };
      if (url.pathname.endsWith("/auth/me")) body = { user: { id: "admin", name: "Admin", role: "Admin" } };
      if (url.pathname.endsWith("/users")) body = { items: users, total: 2 };
      if (url.pathname.endsWith("/current")) body = { weekStart: "2026-11-23", sheet: null };
      if (url.pathname.endsWith("/timesheets")) {
        const selected = url.searchParams.get("userId");
        const items = users.filter((u) => !selected || u.id === selected).map((u) => ({
          _id: u.id, user: u.id, __v: 3, status: "Submitted", weekStart: "2026-11-23",
          totalHours: 40, entries: [], history: [],
        }));
        body = { items: approved ? [] : items, total: approved ? 0 : 25 };
      }
      if (url.pathname.endsWith("/approve")) {
        requests.push({ path: url.pathname, body: route.request().postDataJSON() });
        approved = true;
        if (filtered) {
          await route.fulfill({ status: 409, json: { error: "Timesheet changed. Reload and try again." } });
          return;
        }
      }
      await route.fulfill({ json: body });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Approvals", exact: true }).click();
    if (filtered) await page.getByLabel("Team member", { exact: true }).selectOption("a");
    await expect(page.locator(".approval")).toHaveCount(filtered ? 1 : 2);
    await page.getByRole("button", { name: "Approve All", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(`Approve all ${filtered ? 1 : 2} submitted timesheets`);
    expect(requests).toEqual([]);
    await page.getByRole("button", { name: "Confirm approval of all" }).click();
    if (filtered) {
      await expect(page.getByRole("dialog")).toContainText("0 approved. 1 could not be approved.");
      await expect(page.getByRole("dialog")).toContainText("Timesheet changed");
    } else {
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    expect(requests).toEqual((filtered ? ["a"] : ["a", "b"]).map((id) => ({ path: `/api/timesheets/${id}/approve`, body: { version: 3 } })));
    await expect(page.getByRole("button", { name: "Approve All", exact: true })).toBeDisabled();
  });
}
