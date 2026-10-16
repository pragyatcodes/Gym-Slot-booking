const $ = (s, r = document) => r.querySelector(s);
const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
  ticket:
    '<path d="M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4Z"/><path d="M15 5v3m0 3v2m0 3v3"/>',
  logout: '<path d="M9 4H4v16h5m5-12 4 4-4 4m-5-4h12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  leaf: '<path d="M20 3C5 2 2 9 6 15s16 4 14-12Z"/><path d="M4 21 15 10m-6 6v-5m0 5h5"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  shield:
    '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  qr: '<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/><rect x="7" y="7" width="3" height="3"/><rect x="14" y="7" width="3" height="3"/><rect x="7" y="14" width="3" height="3"/><path d="M14 14h3v3h-3Z"/>',
  heart:
    '<path d="M20 5c-3-3-7-1-8 2-1-3-5-5-8-2-5 5 3 11 8 15 5-4 13-10 8-15Z"/>',
  settings:
    '<path d="m12 3 3 2 4 1v4l2 2-2 3v4h-4l-3 2-3-2H5v-4l-2-3 2-2V6l4-1Z"/><circle cx="12" cy="12" r="3"/>',
};
function icon(n) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[n] || icons.sun}</svg>`;
}
function esc(v) {
  return String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function brand() {
  return '<div class="brand"><span class="brand-mark"><i></i><i></i><i></i></span>FORM<small>®</small></div>';
}
// Embedded browsers may deny Web Storage. Authentication still works in memory.
const memoryStorage = new Map();
function storage(kind, action, key, value) {
  const memoryKey = kind + ':' + key;
  if (action === 'setItem') memoryStorage.set(memoryKey, value);
  if (action === 'removeItem') memoryStorage.delete(memoryKey);
  try {
    return window[kind][action](key, value);
  } catch {
    return action === 'getItem' ? memoryStorage.get(memoryKey) || null : undefined;
  }
}
function currentRoute() {
  return location.hash.startsWith('#/') ? location.hash.slice(1) : location.pathname;
}
let token = storage('localStorage', 'getItem', "form_token"),
  user = null,
  allSessions = [],
  myBookings = [],
  selectedDate = "",
  filter = "All sessions",
  bookingFilter = "Upcoming",
  serverTime = "",
  loading = false,
  pending = new Set(),
  polling = null,
  rosterId = "",
  renderVersion = 0;
const api = async (path, options = {}) => {
  const requestToken = token;
  const res = await fetch("/api" + path, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(requestToken ? { Authorization: "Bearer " + requestToken, "X-Form-Token": requestToken } : {}),
      ...options.headers,
    },
  });
  let d;
  try {
    d = await res.json();
  } catch {
    throw Error("The server is unavailable. Please try again.");
  }
  if (!res.ok) {
    if (res.status === 401 && user && token === requestToken && path !== "/login") {
      token = null;
      user = null;
      storage("localStorage", "removeItem", "form_token");
      navigate("/login");
    }
    throw Error(d.error?.message || "Request failed.");
  }
  return d;
};
const fmtDate = (s, opts) =>
  new Date(s.slice(0, 10) + "T12:00:00").toLocaleDateString("en-GB", opts);
const fmtTime = (s) =>
  new Date(s).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const endTime = (s) =>
  fmtTime(new Date(new Date(s).getTime() + 3600000).toISOString().slice(0, 19));
function timeRange(s) {
  const d = new Date(s);
  const e = new Date(d.getTime() + 3600000);
  return `${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })} – ${e.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
}
function initials(name) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((x) => x[0])
    .join("");
}
function toast(message, error = false) {
  const el = $("#toast");
  el.textContent = message;
  el.className = "show" + (error ? " error" : "");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.className = ""), 4500);
}
function navigate(path) {
  // Hash routes stay in this document, including when embedded in a preview.
  if (currentRoute() === path && location.hash) renderRoute();
  else location.hash = path;
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-route]");
  if (a) {
    e.preventDefault();
    navigate(a.getAttribute("href"));
  }
});
window.addEventListener("hashchange", renderRoute);
function shell(page) {
  const count = myBookings.filter(
    (b) => b.status === "confirmed" && b.starts_at > serverTime,
  ).length;
  return `<aside class="sidebar">${brand()}<div class="studio-label">MOVEMENT STUDIO</div><div class="nav-label">YOUR STUDIO</div><nav><a data-route class="nav-link ${page === "sessions" ? "active" : ""}" href="/sessions">${icon("grid")}<span>Sessions</span></a><a data-route class="nav-link ${page === "bookings" ? "active" : ""}" href="/bookings">${icon("ticket")}<span>My bookings</span>${count ? `<span class="nav-count">${count}</span>` : ""}</a>${user.role === "admin" ? `<a data-route class="nav-link ${page === "admin" ? "active" : ""}" href="/admin">${icon("settings")}<span>Studio admin</span></a>` : ""}</nav><div class="sidebar-bottom"><div class="studio-note">${icon("leaf")}<strong>A little space. A better you.</strong><p>One hour to move, reset,<br>and feel more like yourself.</p></div><div class="profile"><div class="avatar">${esc(initials(user.name))}</div><div><strong>${esc(user.name)}</strong><small>${user.email.endsWith("@form.studio") ? "Demo " + user.role : "Studio " + user.role}</small></div><button class="icon-button" id="logout" title="Sign out" aria-label="Sign out">${icon("logout")}</button></div></div></aside><main class="main"><header class="topbar"><div class="breadcrumb">Your studio <span> / &nbsp; ${page === "sessions" ? "Sessions" : page === "bookings" ? "My bookings" : "Studio admin"}</span></div><div class="mobile-brand">${brand()}</div><div class="top-right"><span><i class="open-dot"></i> ${user.email.endsWith("@form.studio") ? "Demo studio" : "Your movement studio"}</span><span style="color:#d9ddcf">|</span><div class="avatar" title="${esc(user.name)}">${esc(initials(user.name))}</div><button class="icon-button" id="topLogout" title="Sign out" aria-label="Sign out">${icon("logout")}</button></div></header><div class="content" id="page"></div></main>`;
}
function footer() {
  return `<footer class="footer"><span>${icon("leaf")} A little movement goes a long way.</span><span>20 mats. One community. &nbsp; · &nbsp; All times IST</span></footer>`;
}
function heading(title, sub, eye = "MAKE TIME FOR YOURSELF") {
  return `<div class="heading-row"><div><div class="eyebrow">${eye}</div><h1>${title}</h1><p>${sub}</p></div><div class="date-label">${icon("calendar")}${fmtDate(serverTime || new Date().toISOString(), { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div></div>`;
}
function loadingUI() {
  return '<div class="loading"><span class="spinner"></span><p>Making room for you…</p></div>';
}
function errorUI(message) {
  return `<div class="error-panel"><h3>We couldn’t load your studio</h3><p>${esc(message)}</p><button class="btn btn-secondary" onclick="renderRoute()">Try again</button></div>`;
}
async function renderRoute() {
  clearInterval(polling);
  const version = ++renderVersion;
  let path = currentRoute();
  if (!user) {
    renderAuth(path === "/register");
    return;
  }
  if (path === "/login" || path === "/register" || path === "/") {
    path = "/sessions";
  }
  if (path === "/admin" && user.role !== "admin") {
    toast("The admin page is only available to staff.", true);
    navigate("/sessions");
    return;
  }
  const page =
    path === "/bookings"
      ? "bookings"
      : path === "/admin"
        ? "admin"
        : "sessions";
  $("#app").innerHTML = shell(page);
  $("#logout").onclick = logout;
  $("#topLogout").onclick = logout;
  $("#page").innerHTML = loadingUI();
  try {
    await loadData();
    if (version !== renderVersion) return;
    drawPage(page);
    polling = setInterval(() => refresh(page), 5000);
  } catch (e) {
    if (version === renderVersion && $("#page"))
      $("#page").innerHTML = errorUI(e.message);
  }
}
async function loadData() {
  const [s, b] = await Promise.all([api("/sessions"), api("/bookings")]);
  allSessions = s.sessions;
  myBookings = b.bookings;
  serverTime = s.server_time;
  if (!selectedDate) selectedDate = serverTime.slice(0, 10);
}
async function refresh(page) {
  if (document.hidden || pending.size || loading) return;
  const version = renderVersion;
  try {
    const old = JSON.stringify([allSessions, myBookings]);
    await loadData();
    if (!user || version !== renderVersion) return;
    const indicator = $(".live");
    if (indicator) indicator.innerHTML = "<i></i> Live availability";
    if (page === "admin") {
      await updateRoster();
    } else if (old !== JSON.stringify([allSessions, myBookings])) {
      drawPage(page);
    }
  } catch (e) {
    const indicator = $(".live");
    if (indicator) indicator.textContent = "Connection lost · retrying";
  }
}
function drawPage(page) {
  if (window.FormCalendar) {
    window.FormCalendar.unmountMetallics();
    if (page !== "sessions") window.FormCalendar.unmount();
  }
  if (page === "sessions") drawSessions();
  else if (page === "bookings") drawBookings();
  else drawAdmin();
}

function mountGlassCalendar() {
  const host = document.getElementById("glass-calendar");
  if (!host || !window.FormCalendar) return;
  const counts = {};
  allSessions.forEach((session) => {
    const day = session.starts_at.slice(0, 10);
    counts[day] = (counts[day] || 0) + 1;
  });
  const options = {
    selectedDate,
    today: serverTime.slice(0, 10),
    sessionCounts: counts,
    userId: user && user.id,
    onDateSelect: (date) => {
      if (date === selectedDate) {
        drawSessionCards();
        return;
      }
      selectedDate = date;
      drawSessionCards();
    },
  };
  if (user && user.role === "admin") {
    options.onNewEvent = () => navigate("/admin");
  } else {
    options.onViewSessions = () => {
      const cards = document.getElementById("sessionCards");
      if (cards) cards.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }
  window.FormCalendar.mount(host, options);
}

function drawSessions() {
  if (window.FormCalendar) {
    window.FormCalendar.unmountMetallics();
    window.FormCalendar.unmount();
  }
  const today = serverTime.slice(0, 10);
  const todays = allSessions.filter((s) => s.starts_at.startsWith(today));
  const upcoming = myBookings.filter(
    (b) => b.status === "confirmed" && b.starts_at > serverTime,
  ).length;
  const waiting = myBookings.filter(
    (b) => b.status === "waitlisted" && b.starts_at > serverTime,
  ).length;
  $("#page").innerHTML =
    heading(
      `Find your next session.`,
      `Choose a session, reserve your mat, and make time to move.`,
    ) +
    `<section class="hero"><img src="/static/studio.jpg" alt="Sunlight filling a peaceful studio with yoga mats"><div class="hero-copy"><div class="eyebrow">${icon("sun")} A LITTLE MOVEMENT, EVERY DAY</div><h2>Move well.<br>Feel better.</h2><p>Guided sessions. A welcoming community.<br>One hour, just for you.</p></div><div class="hero-badge">${icon("users")} Small groups. Real connection.</div></section><div class="stats"><div class="stat"><div class="stat-icon">${icon("calendar")}</div><div><div class="stat-label">Today’s sessions</div><strong>${todays.length.toString().padStart(2, "0")}</strong><small>Available on today’s schedule</small></div></div><div class="stat"><div class="stat-icon">${icon("ticket")}</div><div><div class="stat-label">Your upcoming bookings</div><strong>${upcoming.toString().padStart(2, "0")}</strong><small>Confirmed reservations</small></div></div><div class="stat"><div class="stat-icon">${icon("clock")}</div><div><div class="stat-label">On your waitlist</div><strong>${waiting.toString().padStart(2, "0")}</strong><small>Automatically booked when a mat opens</small></div></div></div><section><div class="section-title"><div><h2>Session schedule</h2><p>A full hour for you. All sessions are limited to 20 mats.</p></div><span class="live"><i></i> Live availability</span></div><div id="glass-calendar" class="glass-calendar-scope"></div><div class="filters">${["All sessions", "Yoga", "Strength", "Pilates", "HIIT", "Recovery"].map((k) => `<button class="chip ${filter === k ? "active" : ""}" data-filter="${k}" aria-pressed="${filter === k}">${k}</button>`).join("")}<span class="results-label" id="resultsLabel"></span></div><div class="cards" id="sessionCards"></div></section>` +
    footer();
  mountGlassCalendar();
  document.querySelectorAll("[data-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        filter = b.dataset.filter;
        drawSessions();
      }),
  );
  drawSessionCards();
}
function drawSessionCards() {
  const rows = allSessions.filter(
    (s) =>
      s.starts_at.startsWith(selectedDate) &&
      (filter === "All sessions" || s.kind === filter),
  );
  // Keep bookable sessions first, while retaining today's completed sessions.
  rows.sort(
    (a, b) =>
      Number(a.started) - Number(b.started) ||
      a.starts_at.localeCompare(b.starts_at),
  );
  $("#resultsLabel").textContent =
    `${rows.length} sessions · ${fmtDate(selectedDate, { day: "numeric", month: "short" })}`;
  $("#sessionCards").innerHTML = rows.length
    ? rows.map(sessionCard).join("")
    : `<div class="empty">${icon("calendar")}<h3>A little breathing room</h3><p>No ${filter === "All sessions" ? "" : esc(filter.toLowerCase()) + " "}sessions on this date.<br>Try another day or explore a different session type.</p><button class="btn btn-secondary" onclick="filter='All sessions';selectedDate=serverTime.slice(0,10);drawSessions()">See today’s sessions</button></div>`;
  if (window.FormCalendar) window.FormCalendar.hydrateMetallics(document.getElementById("sessionCards") || document);
  document
    .querySelectorAll("[data-view-booking]")
    .forEach((b) => (b.onclick = () => navigate("/bookings")));
  document.querySelectorAll("[data-admin-roster]").forEach(
    (b) =>
      (b.onclick = () => {
        rosterId = b.dataset.adminRoster;
        navigate("/admin");
      }),
  );
}
function sessionCard(s) {
  const own = s.booking;
  const full = s.remaining === 0;
  const low = s.remaining <= 4 && !full;
  let button;
  if (s.started)
    button = `<button class="btn btn-secondary" disabled>${s.starts_at.slice(0, 13) === serverTime.slice(0, 13) ? "In progress" : "Session ended"}</button>`;
  else if (user.role === "admin")
    button = `<button class="btn btn-secondary" data-admin-roster="${s.id}">View roster ${icon("arrow")}</button>`;
  else if (own)
    button = `<button class="btn btn-booked" data-view-booking="${own.id}">${icon(own.status === "waitlisted" ? "clock" : "check")}${own.status === "waitlisted" ? `Waitlist · Position ${own.position}` : "You’re booked"}</button>`;
  else
    button = `<span class="metallic-host" data-metallic data-label="${pending.has(s.id) ? "Saving your place…" : full ? "Join waitlist" : "Book session"}" data-action="book" data-id="${s.id}" data-icon="${full ? "plus" : "arrow"}" ${pending.has(s.id) ? "data-disabled=\"true\"" : ""}></span>`;
  return `<article class="session-card ${s.started ? "past" : ""}"><div class="card-top"><span class="category ${esc(s.kind)}">${icon(s.kind === "Yoga" ? "leaf" : s.kind === "Recovery" ? "heart" : "sun")}${esc(s.kind)}</span><span class="duration">${icon("clock")} 60 min</span></div><h3>${esc(s.title)}</h3><div class="session-time">${timeRange(s.starts_at)}</div><div class="coach"><span class="mini-avatar">${esc(initials(s.coach))}</span> with ${esc(s.coach)}</div><div class="seat-line ${full ? "full" : low ? "low" : ""}"><strong>${full ? "All mats taken" : `${s.remaining} mats available`}</strong><span>${s.confirmed} / 20</span></div><div class="progress ${full ? "full" : low ? "low" : ""}"><div style="width:${(s.confirmed / 20) * 100}%"></div></div>${button}<div class="card-footer">${s.started ? "See you at the next one" : own?.status === "confirmed" ? "Your time. Your space." : full ? `${s.waitlist_count ? s.waitlist_count + " in line · " : ""}A spot opens? You’re next in line.` : low ? "A few mats left. Make one yours." : "Move at your own pace."}</div></article>`;
}
async function bookSession(id) {
  if (pending.has(id)) return;
  const s = allSessions.find((s) => s.id === id);
  const previous = { ...s };
  const wait = s.remaining === 0;
  pending.add(id);
  if (!wait) {
    s.remaining--;
    s.confirmed++;
  }
  drawSessionCards();
  try {
    const d = await api(`/sessions/${id}/book`, {
      method: "POST",
      body: JSON.stringify({ waitlist: wait }),
    });
    toast(
      d.booking.status === "waitlisted"
        ? `You’re on the list at position ${d.booking.position}. We’ll book you automatically when a mat opens.`
        : "Your mat is reserved. Find your check-in code in My bookings.",
    );
    await loadData();
  } catch (e) {
    Object.assign(s, previous);
    toast(e.message, true);
  } finally {
    pending.delete(id);
    if (currentRoute() === "/sessions") drawSessions();
  }
}
function drawBookings() {
  const rows = myBookings.filter((b) =>
    bookingFilter === "Cancelled"
      ? b.status === "cancelled"
      : bookingFilter === "Past"
        ? b.status !== "cancelled" && b.starts_at <= serverTime
        : b.status !== "cancelled" && b.starts_at > serverTime,
  );
  $("#page").innerHTML =
    heading(
      "Your bookings.",
      "Your sessions, your check-in codes, and a little something to look forward to.",
      "MY BOOKINGS",
    ) +
    `<div class="section-title"><div><h2>Your bookings</h2><p>Plans change. Cancel any time before your session starts.</p></div><span class="live"><i></i> Updates automatically</span></div><div class="filters">${["Upcoming", "Past", "Cancelled"].map((f) => `<button class="chip ${bookingFilter === f ? "active" : ""}" data-bfilter="${f}">${f}</button>`).join("")}<span class="results-label">${rows.length} ${rows.length === 1 ? "booking" : "bookings"}</span></div><div class="cards">${rows.length ? rows.map((b) => `<article class="session-card"><div class="card-top"><span class="category ${esc(b.kind)}">${esc(b.kind)}</span><span class="badge ${b.status}">${b.checked_in_at ? "Checked in" : b.status === "waitlisted" ? "Waitlisted" : b.status === "cancelled" ? "Cancelled" : "Confirmed"}</span></div><div class="booking-date">${fmtDate(b.starts_at, { weekday: "long", day: "numeric", month: "long" })}</div><h3>${esc(b.title)}</h3><div class="session-time">${timeRange(b.starts_at)}</div><div class="coach">${icon("users")} ${esc(b.coach)}</div>${b.status === "confirmed" ? `<div class="booking-code"><div><small>${b.checked_in_at ? "YOU’RE ALL CHECKED IN" : "YOUR CHECK-IN CODE"}</small><strong>${esc(b.code)}</strong></div>${icon(b.checked_in_at ? "check" : "qr")}</div><p class="card-footer">Show this code at the studio during your session.</p>` : b.status === "waitlisted" ? `<div class="booking-code"><div><small>YOUR PLACE IN LINE</small><strong>#${b.position}</strong></div>${icon("clock")}</div><p class="card-footer">A mat opens? We’ll book you automatically.</p>` : ""}${b.starts_at > serverTime && b.status !== "cancelled" ? `<button style="margin-top:16px" class="btn btn-secondary" data-cancel="${b.id}">${b.status === "waitlisted" ? "Leave waitlist" : "Cancel booking"}</button>` : ""}</article>`).join("") : `<div class="empty">${icon("ticket")}<h3>${bookingFilter === "Upcoming" ? "Make a little time for you." : "Nothing here just yet."}</h3><p>${bookingFilter === "Upcoming" ? "Your next feel-good hour is waiting. Find a session and reserve your mat." : `Your ${bookingFilter.toLowerCase()} bookings will appear here.`}</p><a data-route href="/sessions" class="btn btn-primary">Explore sessions ${icon("arrow")}</a></div>`}</div>` +
    footer();
  document.querySelectorAll("[data-bfilter]").forEach(
    (b) =>
      (b.onclick = () => {
        bookingFilter = b.dataset.bfilter;
        drawBookings();
      }),
  );
  document
    .querySelectorAll("[data-cancel]")
    .forEach(
      (b) => (b.onclick = () => confirmCancel(Number(b.dataset.cancel))),
    );
}
function confirmCancel(id) {
  const b = myBookings.find((b) => b.id === id);
  const wait = b.status === "waitlisted";
  const prev = document.activeElement;
  $("#modal").innerHTML =
    `<div class="modal-backdrop"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialogTitle"><div class="eyebrow">A CHANGE OF PLANS</div><h2 id="dialogTitle">${wait ? "Leave the waitlist?" : "Release your mat?"}</h2><p>${esc(b.title)} · ${fmtDate(b.starts_at, { day: "numeric", month: "short" })}<br>${wait ? "You’ll lose your current position in the queue." : "Your place will go to the next person in line. You can always rebook if a mat is available."}</p><div class="dialog-actions"><button class="btn btn-secondary" id="keepBooking">Keep my place</button><button class="btn btn-danger" id="confirmCancel">${wait ? "Leave waitlist" : "Yes, cancel booking"}</button></div></section></div>`;
  const close = () => {
    $("#modal").innerHTML = "";
    prev?.focus();
  };
  $("#keepBooking").onclick = close;
  $("#keepBooking").focus();
  $(".dialog").onkeydown = (e) => {
    if (e.key === "Escape") close();
    if (e.key === "Tab") {
      const buttons = [...$(".dialog").querySelectorAll("button")];
      if (e.shiftKey && document.activeElement === buttons[0]) {
        e.preventDefault();
        buttons[1].focus();
      } else if (!e.shiftKey && document.activeElement === buttons[1]) {
        e.preventDefault();
        buttons[0].focus();
      }
    }
  };
  $("#confirmCancel").onclick = async (e) => {
    e.target.disabled = true;
    pending.add("cancel");
    try {
      await api("/bookings/" + id, { method: "DELETE" });
      close();
      toast(
        wait
          ? "You’ve left the waitlist."
          : "Booking cancelled. A little room for someone else.",
      );
      await loadData();
      drawBookings();
    } catch (err) {
      toast(err.message, true);
      e.target.disabled = false;
    } finally {
      pending.delete("cancel");
    }
  };
}
function drawAdmin() {
  const future = allSessions.filter((s) => s.starts_at > serverTime);
  $("#page").innerHTML =
    heading(
      "Manage your studio.",
      "Create room to move, welcome your members, and keep every session in sync.",
      "STUDIO ADMIN",
    ) +
    `<div class="admin-grid"><section class="panel"><h2>Create a session</h2><p>One hour, 20 mats. Times are in Asia/Kolkata (IST).</p><form id="createForm" novalidate><div class="field"><label for="title">Session name</label><input id="title" name="title" required maxlength="80" placeholder="e.g. Morning flow"><span class="field-error"></span></div><div class="field-row"><div class="field"><label for="sessionDate">Date</label><input type="date" id="sessionDate" name="date" value="${serverTime.slice(0, 10)}" min="${serverTime.slice(0, 10)}" required><span class="field-error"></span></div><div class="field"><label for="hour">Start hour</label><select name="hour" id="hour">${Array.from({ length: 24 }, (_, i) => `<option value="${String(i).padStart(2, "0")}" ${i === 9 ? "selected" : ""}>${String(i).padStart(2, "0")}:00</option>`).join("")}</select></div></div><div class="field-row"><div class="field"><label for="coach">Instructor</label><input name="coach" id="coach" required maxlength="80" placeholder="Instructor’s name"><span class="field-error"></span></div><div class="field"><label for="kind">Session type</label><select id="kind" name="kind">${["Yoga", "Strength", "Pilates", "HIIT", "Recovery"].map((k) => `<option>${k}</option>`).join("")}</select></div></div><p class="form-error" role="alert"></p><span class="metallic-host" data-metallic data-label="Create session" data-type="submit" data-icon="plus"></span></form></section><section class="panel"><h2>Check in a member</h2><p>Enter a member’s code to check them in. Codes work once, only during the session’s hour.</p><form id="checkinForm" novalidate><div class="field"><label for="checkCode">Check-in code</label><input id="checkCode" name="code" required minlength="8" maxlength="8" pattern="[A-Za-z2-9]{8}" placeholder="e.g. 7XKP2QAB" autocomplete="off" style="font-size:23px;letter-spacing:5px;text-transform:uppercase"><span class="field-error"></span></div><p class="form-error" role="alert"></p><span class="metallic-host" data-metallic data-label="Check in member" data-type="submit" data-icon="sparkles"></span></form><div id="checkinResult" aria-live="polite"></div><div class="studio-note" style="margin:28px 0 0"><strong>${icon("shield")} Every mat, accounted for.</strong><p>Only confirmed bookings can check in. Cancelled codes are invalidated immediately.</p></div></section></div><section class="panel"><div class="section-title"><div><h2>Session roster</h2><p>Confirmed members, waitlist order, and attendance.</p></div><span class="live"><i></i> Live roster</span></div><label for="rosterSession" style="font-size:11px;color:#8b9780">Choose a session</label><select id="rosterSession" class="roster-select"><option value="">Select a session…</option>${allSessions.map((s) => `<option value="${s.id}" ${String(s.id) === String(rosterId) ? "selected" : ""}>${fmtDate(s.starts_at, { day: "numeric", month: "short" })} · ${fmtTime(s.starts_at)} · ${esc(s.title)} (${s.confirmed}/20)</option>`).join("")}</select><div id="roster"><div class="empty"><p>Select a session to see who’s joining.</p></div></div></section>` +
    footer();
  $("#createForm").onsubmit = createSession;
  $("#checkinForm").onsubmit = checkin;
  if (window.FormCalendar) window.FormCalendar.hydrateMetallics(document.getElementById("page"));
  $("#rosterSession").onchange = (e) => {
    rosterId = e.target.value;
    $("#roster").innerHTML = loadingUI();
    updateRoster();
  };
  if (rosterId) updateRoster();
}
function validate(form) {
  let valid = true;
  form.querySelectorAll("input").forEach((input) => {
    const output = input.parentElement.querySelector(".field-error");
    let msg = "";
    if (input.required && !input.value.trim()) msg = "This field is required.";
    else if (!input.checkValidity())
      msg =
        input.type === "email"
          ? "Enter a valid email address."
          : input.name === "password"
            ? "Use 8–128 characters."
            : input.name === "code"
              ? "Enter an 8-character code (letters and 2–9)."
              : "Please enter a valid value.";
    if (output) output.textContent = msg;
    input.setAttribute("aria-invalid", !!msg);
    if (msg) valid = false;
    input.oninput = () => {
      if (output) output.textContent = "";
      input.setAttribute("aria-invalid", "false");
    };
  });
  if (!valid) form.querySelector('[aria-invalid="true"]')?.focus();
  return valid;
}
async function createSession(e) {
  e.preventDefault();
  const form = e.target;
  if (!validate(form)) return;
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  pending.add("create");
  const d = Object.fromEntries(new FormData(form));
  form.querySelector(".form-error").textContent = "";
  try {
    const res = await api("/sessions", {
      method: "POST",
      body: JSON.stringify({
        title: d.title,
        coach: d.coach,
        kind: d.kind,
        starts_at: `${d.date}T${d.hour}:00:00`,
      }),
    });
    rosterId = res.session.id;
    await loadData();
    drawAdmin();
    toast("A new hour to move. Session created.");
  } catch (err) {
    form.querySelector(".form-error").textContent = err.message;
  } finally {
    btn.disabled = false;
    pending.delete("create");
  }
}
async function checkin(e) {
  e.preventDefault();
  const form = e.target;
  if (!validate(form)) return;
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  pending.add("checkin");
  form.querySelector(".form-error").textContent = "";
  $("#checkinResult").innerHTML = "";
  try {
    const d = await api("/admin/checkin", {
      method: "POST",
      body: JSON.stringify({ code: form.code.value }),
    });
    $("#checkinResult").innerHTML =
      `<div class="success-box">${icon("check")} <strong>Welcome, ${esc(d.name)}.</strong><br>Checked in for ${esc(d.title)}. Enjoy your session!</div>`;
    form.reset();
    updateRoster();
  } catch (err) {
    form.querySelector(".form-error").textContent = err.message;
  } finally {
    btn.disabled = false;
    pending.delete("checkin");
  }
}
async function updateRoster() {
  if (!$("#roster")) return;
  if (!rosterId) {
    $("#roster").innerHTML =
      '<div class="empty"><p>Select a session to see who’s joining.</p></div>';
    return;
  }
  const id = rosterId;
  try {
    const d = await api(`/admin/sessions/${id}/bookings`);
    if (!$("#roster") || id !== rosterId) return;
    $("#roster").innerHTML = d.bookings.length
      ? `<div class="table-wrap"><table><thead><tr><th>MEMBER</th><th>STATUS</th><th>CODE / POSITION</th><th>ATTENDANCE</th></tr></thead><tbody>${d.bookings.map((b) => `<tr><td>${esc(b.name)}<small>${esc(b.email)}</small></td><td><span class="badge ${b.status}">${b.status}</span></td><td>${b.status === "waitlisted" ? "#" + b.position : esc(b.code) || "—"}</td><td>${b.checked_in_at ? "✓ Checked in" : "—"}</td></tr>`).join("")}</tbody></table></div>`
      : '<div class="empty"><h3>A fresh start</h3><p>No bookings yet. Members can now reserve their mat.</p></div>';
  } catch (e) {
    if ($("#roster"))
      $("#roster").innerHTML =
        `<div class="error-panel">${esc(e.message)}<br><button class="btn btn-secondary" onclick="updateRoster()">Try again</button></div>`;
  }
}
function renderAuth(register = false) {
  clearInterval(polling);
  if (window.FormCalendar) {
    window.FormCalendar.unmountMetallics();
    window.FormCalendar.unmount();
  }
  $("#app").innerHTML =
    `<div class="auth-layout"><section class="auth-story"><img src="/static/studio.jpg" alt="A calm, sunlit movement studio">${brand()}<div class="auth-quote"><h1>A little space.<br>A better you.</h1><p>Movement that meets you where you are.<br>Find your flow with the FORM community.</p></div></section><main class="auth-right"><div class="auth-box"><div class="eyebrow">YOUR NEXT HOUR STARTS HERE</div><h2>${register ? "Create your account." : "Welcome back."}</h2><p>${register ? "Create an account to reserve your first session." : "Sign in to book sessions and manage your reservations."}</p><form id="authForm" novalidate>${register ? '<div class="field"><label for="name">Full name</label><input id="name" name="name" autocomplete="name" placeholder="Your name" minlength="2" maxlength="80" required><span class="field-error"></span></div>' : ""}<div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" maxlength="254" required><span class="field-error"></span></div><div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="${register ? "new-password" : "current-password"}" placeholder="At least 8 characters" minlength="8" maxlength="128" required><span class="field-error"></span></div><p class="form-error" role="alert"></p><span class="metallic-host" data-metallic data-label="${register ? "Create your account" : "Sign in"}" data-type="submit" data-icon="arrow"></span></form><div class="auth-switch">${register ? 'Already part of the studio? <a data-route href="/login">Sign in</a>' : 'New to FORM? <a data-route href="/register">Create an account</a>'}</div><div class="demo-box"><strong>Take a look around</strong><p>This is a working demo. Explore as a member or try the studio admin tools.</p><div class="demo-actions"><span class="metallic-host" id="demoMember" data-metallic data-label="Member demo" data-action="demo-member" data-icon="arrow"></span><span class="metallic-host" id="demoAdmin" data-metallic data-label="Admin demo" data-action="demo-admin" data-icon="sparkles"></span></div></div></div></main></div>`;
  $("#authForm").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    if (!validate(form)) return;
    const btn = form.querySelector("button");
    btn.disabled = true;
    form.querySelector(".form-error").textContent = "";
    try {
      const d = await api(register ? "/register" : "/login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      setAuth(d);
      navigate("/sessions");
    } catch (err) {
      form.querySelector(".form-error").textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  };
  if (window.FormCalendar) window.FormCalendar.hydrateMetallics(document.getElementById("app"));
  bindMetallicClicks();
}
let metallicBound = false;
function bindMetallicClicks() {
  if (metallicBound) return;
  metallicBound = true;
  document.addEventListener("metallic-click", onMetallicClick);
}
function onMetallicClick(e) {
  const action = e.detail && e.detail.action;
  if (action === "demo-member") demoLogin("member", e.target);
  if (action === "demo-admin") demoLogin("admin", e.target);
  if (action === "book") bookSession(Number(e.detail.id));
}
function setAuth(d) {
  token = d.token;
  user = d.user;
  storage("localStorage", "setItem", "form_token", token);
  storage("sessionStorage", "setItem", "form_visited", "1");
  selectedDate = "";
  allSessions = [];
  myBookings = [];
}
async function demoLogin(role, btn) {
  if (pending.has('demo-login')) return;
  pending.add('demo-login');
  const buttons = [...document.querySelectorAll('#demoMember button, #demoAdmin button, #authForm button')];
  buttons.forEach(button => button.disabled = true);
  const error = document.querySelector('#authForm .form-error');
  if (error) error.textContent = '';
  if (btn && btn.tagName === 'BUTTON') btn.textContent = 'Signing in…';
  try {
    const d = await api("/login", {
      method: "POST",
      body: JSON.stringify({
        email: role === "admin" ? "admin@form.studio" : "alex@form.studio",
        password: "DemoPass123!",
      }),
    });
    setAuth(d);
    navigate(role === "admin" ? "/admin" : "/sessions");
  } catch (e) {
    toast(e.message, true);
    if (error) error.textContent = e.message;
    if (btn && btn.tagName === 'BUTTON') btn.textContent = role === 'admin' ? 'Admin demo' : 'Member demo';
  } finally {
    pending.delete('demo-login');
    buttons.forEach(button => button.disabled = false);
  }
}
async function logout() {
  clearInterval(polling);
  document
    .querySelectorAll("#logout, #topLogout")
    .forEach((button) => (button.disabled = true));
  try {
    await api("/logout", { method: "POST", body: "{}" });
  } catch {}
  token = null;
  user = null;
  storage("localStorage", "removeItem", "form_token");
  storage("sessionStorage", "setItem", "form_visited", "1");
  navigate("/login");
}
async function boot() {
  $("#app").innerHTML =
    '<div style="padding:15vh 10vw">' + loadingUI() + "</div>";
  if (token) {
    try {
      const d = await api("/me");
      user = d.user;
      serverTime = d.server_time;
    } catch {
      token = null;
      storage("localStorage", "removeItem", "form_token");
    }
  }
  if (
    !user &&
    !storage("sessionStorage", "getItem", "form_visited") &&
    currentRoute() !== "/login" &&
    currentRoute() !== "/register"
  ) {
    await demoLogin("member");
    if (!user) renderAuth();
    return;
  }
  renderRoute();
}
boot();
