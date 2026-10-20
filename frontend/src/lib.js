export const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export const istToday = () =>
  new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
export const addDays = (value, n) => {
  const d = new Date(value + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const currentWeek = () => {
  const s = istToday();
  return addDays(s, -((new Date(s).getUTCDay() + 6) % 7));
};
export const nice = (value) =>
  new Date(value + "T00:00:00Z").toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
export const stamp = (value) =>
  new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }) + " IST";
export const hours = (rows) =>
  Math.round(rows.reduce((a, r) => a + (Number(r.hours) || 0), 0) * 100) / 100;
export const initials = (name) =>
  name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("");
export const keyOf = (item) => item._id || item.id;
export const nameOf = (items, id, fallback = "Unavailable") =>
  items.find((x) => keyOf(x) === id)?.name || fallback;
export function entryPayload(rows) {
  return rows.map((r, i) => {
    const n = Number(r.hours);
    if (
      !r.project ||
      !r.task ||
      !r.description.trim() ||
      !Number.isFinite(n) ||
      n <= 0 ||
      Math.abs(n * 100 - Math.round(n * 100)) > 0.00001
    )
      throw new Error(
        `Entry ${i + 1}: choose a project and task, add a description, and enter positive hours with at most two decimal places.`,
      );
    return {
      date: r.date,
      project: r.project,
      task: r.task,
      description: r.description.trim(),
      hours: n,
    };
  });
}
