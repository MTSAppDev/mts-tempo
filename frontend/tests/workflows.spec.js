import { test, expect } from "@playwright/test";
const password = "Browser-test-password-42!";
async function login(page, email, pass = password) {
  await page.goto("/");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(pass);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My timesheet" }),
  ).toBeVisible();
}
async function nav(page, name) {
  await page.getByRole("button", { name, exact: true }).first().click();
}
async function create(page, section, button, name) {
  await nav(page, section);
  await page.getByRole("button", { name: button, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog
    .getByRole("button", {
      name: `Create ${section === "Clients" ? "client" : "task"}`,
    })
    .click();
  await expect(dialog).not.toBeVisible();
}
test("real API: invite, assign, track, submit, review, reopen and report", async ({
  page,
  browser,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page, "admin@tempo.test");
  await create(page, "Clients", "New client", "Acme");
  await create(page, "Tasks", "New task", "Development");
  await nav(page, "Team");
  await page.getByRole("button", { name: "Invite user" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name").fill("Jamie Worker");
  await dialog.getByLabel("Email address").fill("jamie@tempo.test");
  await dialog.getByRole("button", { name: "Create invitation" }).click();
  dialog = page.getByRole("dialog", { name: "Invitation ready" });
  await expect(dialog).toBeVisible();
  const link = await dialog.getByLabel("Link", { exact: true }).inputValue(),
    temp = await dialog
      .getByLabel("Temporary password", { exact: true })
      .inputValue();
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await nav(page, "Projects");
  await page.getByRole("button", { name: "New project" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Website refresh");
  await dialog
    .getByRole("combobox", { name: "Client", exact: true })
    .selectOption({ label: "Acme" });
  await dialog.getByLabel("Jamie Worker").check();
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(dialog).not.toBeVisible();
  const workerContext = await browser.newContext(),
    worker = await workerContext.newPage();
  await worker.goto(link);
  await worker.getByLabel("Temporary password").fill(temp);
  await worker.getByRole("button", { name: "Accept invitation" }).click();
  await expect(
    worker.getByRole("heading", { name: "My timesheet" }),
  ).toBeVisible();
  await expect(
    worker.getByRole("button", { name: "Team", exact: true }),
  ).toHaveCount(0);
  await expect(
    worker.getByRole("button", { name: "Approvals", exact: true }),
  ).toHaveCount(0);
  await worker
    .getByRole("button", { name: "Add time Monday", exact: true })
    .click();
  await worker
    .getByLabel("Monday description 1")
    .fill("Implement responsive navigation");
  const hoursInput = worker.getByLabel("Monday hours 1");
  await hoursInput.focus();
  await worker.keyboard.insertText("development");
  await expect(hoursInput).toHaveValue("");
  await worker.keyboard.insertText("e");
  await expect(hoursInput).toHaveValue("");
  await worker.keyboard.insertText("1.25");
  await expect(hoursInput).toHaveValue("1.25");
  await worker.keyboard.insertText("development");
  await expect(hoursInput).toHaveValue("1.25");
  await hoursInput.fill("1e3");
  await expect(hoursInput).toHaveValue("1.25");
  await worker.getByLabel("Monday hours 1").fill("39");
  await worker.getByRole("button", { name: "Submit timesheet" }).click();
  await expect(worker.getByRole("alert").first()).toContainText("At least 40 hours");
  await expect(worker.locator(".timesheet-action-error").getByRole("alert")).toContainText("At least 40 hours");
  await worker.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(worker.getByText("Saved to your workspace")).toBeVisible();
  await worker.reload();
  await expect(worker.getByLabel("Monday hours 1")).toHaveValue("39");
  await worker
    .getByRole("button", { name: "Add time Monday", exact: true })
    .click();
  await worker.getByLabel("Monday description 2").fill("Review accessibility");
  await worker.getByLabel("Monday hours 2").fill("1.5");
  await worker.getByRole("button", { name: "Add time Tuesday", exact: true }).click();
  await worker.getByLabel("Tuesday description 1").fill("Existing Tuesday work");
  await worker.getByLabel("Tuesday hours 1").fill("0.5");
  await worker.getByRole("button", { name: "Copy Monday entries to Tuesday", exact: true }).click();
  await expect(worker.getByLabel("Tuesday description 1")).toHaveValue("Existing Tuesday work");
  await expect(worker.getByLabel("Tuesday description 2")).toHaveValue("Implement responsive navigation");
  await expect(worker.getByLabel("Tuesday hours 2")).toHaveValue("39");
  await expect(worker.getByLabel("Tuesday description 3")).toHaveValue("Review accessibility");
  await expect(worker.getByLabel("Tuesday hours 3")).toHaveValue("1.5");
  await worker.getByLabel("Tuesday hours 2").fill("38");
  await expect(worker.getByLabel("Monday hours 1")).toHaveValue("39");
  await worker.getByRole("button", { name: "Save draft", exact: true }).click();
  await worker.reload();
  await expect(worker.getByLabel("Tuesday hours 2")).toHaveValue("38");
  for (let i = 0; i < 3; i++) {
    await worker.getByRole("button", { name: "Remove Tuesday entry 1", exact: true }).click();
  }
  await worker.getByRole("button", { name: "Submit timesheet" }).click();
  await expect(worker.getByLabel("Monday hours 1")).toBeDisabled();
  await worker.screenshot({
    path: "test-results/user-timesheet.png",
    fullPage: true,
  });
  const managerContext = await browser.newContext(),
    manager = await managerContext.newPage();
  await login(manager, "manager@tempo.test");
  await nav(manager, "Approvals");
  await manager.getByRole("button", { name: "Reject", exact: true }).click();
  dialog = manager.getByRole("dialog");
  await dialog
    .getByLabel("Feedback for your teammate")
    .fill("Please clarify the review");
  await dialog.getByRole("button", { name: "Reject timesheet" }).click();
  await expect(dialog).not.toBeVisible();
  await worker.reload();
  await expect(worker.locator(".info-box")).toContainText("Please clarify the review");
  await worker
    .getByLabel("Monday description 2")
    .fill("Review keyboard navigation and contrast");
  await worker.getByRole("button", { name: "Submit timesheet" }).click();
  await expect(worker.getByLabel("Monday hours 1")).toBeDisabled();
  await manager.reload();
  await nav(manager, "Approvals");
  await manager.getByRole("button", { name: "Approve", exact: true }).click();
  await manager.getByRole("button", { name: "Confirm approval" }).click();
  await expect(manager.getByRole("dialog")).not.toBeVisible();
  await manager.getByRole("button", { name: "Approved", exact: true }).click();
  await expect(
    manager.getByRole("button", { name: "Reopen", exact: true }),
  ).toHaveCount(0);
  await nav(page, "Approvals");
  await page.getByRole("button", { name: "Approved", exact: true }).click();
  await page.getByRole("button", { name: "Reopen", exact: true }).click();
  await page.getByLabel("Reason for reopening").fill("Update project detail");
  await page.getByRole("button", { name: "Reopen for editing" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await worker.reload();
  await expect(worker.getByLabel("Monday hours 1")).toBeEnabled();
  await nav(worker, "Reports");
  await expect(worker.locator(".stat-value").first()).toContainText("40.50");
  await expect(worker.getByLabel("Team member")).toHaveCount(0);
  await worker.getByLabel("Time period").selectOption("custom");
  await worker.getByLabel("Start date").fill("2020-01-01");
  await worker.getByLabel("End date").fill("2030-01-01");
  await expect(
    worker.getByRole("cell", {
      name: "Implement responsive navigation",
      exact: true,
    }),
  ).toBeVisible();
  const downloadPromise = worker.waitForEvent("download");
  await worker.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("tempo-report");
  await nav(page, "Reports");
  await expect(page.getByLabel("Team member")).toBeVisible();
  await page.screenshot({
    path: "test-results/admin-reports.png",
    fullPage: true,
  });
  await worker.setViewportSize({ width: 390, height: 844 });
  await nav(worker, "Timesheet");
  await expect(worker.getByLabel("Monday description 1")).toBeVisible();
  expect(
    await worker.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await worker.screenshot({
    path: "test-results/mobile-timesheet.png",
    fullPage: true,
  });
  await workerContext.close();
  await managerContext.close();
  expect(errors).toEqual([]);
});
test("session restore, password change and logout", async ({ page }) => {
  await login(page, "manager@tempo.test");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "My timesheet" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Account", exact: true })
    .first()
    .click();
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page
    .getByLabel("New password", { exact: true })
    .fill("Changed-browser-password-43!");
  await page
    .getByLabel("Confirm new password")
    .fill("Changed-browser-password-43!");
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await login(page, "manager@tempo.test", "Changed-browser-password-43!");
  await page
    .getByRole("button", { name: "Sign out", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
});
test("login error and expired invitation are recoverable", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Email address").fill("missing@tempo.test");
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid credentials");
  await page.goto("/invite#token=invalid-token-that-is-long-enough-123456");
  await page.getByLabel("Temporary password").fill("wrong");
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Invalid or expired invitation",
  );
});
test("Admin-assisted password recovery works without email", async ({ page, browser }) => {
  await login(page, "admin@tempo.test");
  await nav(page, "Team");
  const managerRow = page.locator(".list-row").filter({ hasText: "Test Manager" });
  await managerRow.getByRole("button", { name: "Manage", exact: true }).click();
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  const ready = page.getByRole("dialog", { name: "Password reset ready" });
  await expect(ready).toBeVisible();
  const link = await ready.getByLabel("Link", { exact: true }).inputValue();
  const temporaryPassword = await ready.getByLabel("Temporary password", { exact: true }).inputValue();
  const context = await browser.newContext();
  const recovery = await context.newPage();
  await recovery.goto(link);
  await login(recovery, "manager@tempo.test", temporaryPassword);
  await nav(recovery, "Team");
  await expect(recovery.getByRole("button", { name: "Invite user" })).toHaveCount(0);
  await nav(recovery, "Clients");
  await expect(recovery.getByRole("button", { name: "New client" })).toHaveCount(0);
  await context.close();
});
test("copy previous week appends matching weekdays and saves independent entries", async ({ page }) => {
  await login(page, "admin@tempo.test");
  await create(page, "Clients", "New client", "Weekly copy client");
  await create(page, "Tasks", "New task", "Weekly copy task");
  await nav(page, "Projects");
  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Weekly copy project");
  await dialog.getByRole("combobox", { name: "Client", exact: true }).selectOption({ label: "Weekly copy client" });
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(dialog).not.toBeVisible();
  await nav(page, "Timesheet");
  await page.getByRole("button", { name: "Previous week", exact: true }).click();
  await page.getByRole("button", { name: "Add time Monday", exact: true }).click();
  await page.getByLabel("Monday description 1").fill("Prior Monday work");
  await page.getByLabel("Monday hours 1").fill("7.5");
  await page.getByRole("button", { name: "Add time Sunday", exact: true }).click();
  await page.getByLabel("Sunday description 1").fill("Prior Sunday work");
  await page.getByLabel("Sunday hours 1").fill("2");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Saved to your workspace")).toBeVisible();
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await page.getByRole("button", { name: "Add time Tuesday", exact: true }).click();
  await page.getByLabel("Tuesday description 1").fill("Keep current work");
  await page.getByLabel("Tuesday hours 1").fill("1");
  await page.getByRole("button", { name: "Copy previous week", exact: true }).click();
  await expect(page.getByLabel("Monday description 1")).toHaveValue("Prior Monday work");
  await expect(page.getByLabel("Monday hours 1")).toHaveValue("7.5");
  await expect(page.getByLabel("Sunday description 1")).toHaveValue("Prior Sunday work");
  await expect(page.getByLabel("Sunday hours 1")).toHaveValue("2");
  await expect(page.getByLabel("Tuesday description 1")).toHaveValue("Keep current work");
  await page.getByLabel("Monday hours 1").fill("8");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Saved to your workspace")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Monday hours 1")).toHaveValue("8");
  await page.getByRole("button", { name: "Previous week", exact: true }).click();
  await expect(page.getByLabel("Monday hours 1")).toHaveValue("7.5");
});
test("timesheet loading failures show a retry instead of a blank editable sheet", async ({ page }) => {
  await page.route("**/api/timesheets?**", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary database outage" }) }));
  await login(page, "admin@tempo.test");
  await expect(page.getByRole("alert")).toContainText("Temporary database outage");
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
  await page.unroute("**/api/timesheets?**");
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeVisible();
});
