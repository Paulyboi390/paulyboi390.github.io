(() => {
  const viewsFactory = window.createHackLabChallengeViews;
  const APP_CONFIG = window.HACKLAB_CONFIG || {};
  const SESSION_STORAGE_KEY = "hacklab-cloud-session";

  if (typeof viewsFactory !== "function") {
    throw new Error("Challenge views failed to load.");
  }

  delete window.createHackLabChallengeViews;

  const API_BASE = detectApiBase();
  const IS_API_CONFIGURED = Boolean(API_BASE);
  const IS_SAME_ORIGIN_API = IS_API_CONFIGURED && new URL(API_BASE, location.href).origin === location.origin;

  const els = {
    navButtons: Array.from(document.querySelectorAll("[data-nav]")),
    pages: Array.from(document.querySelectorAll(".page")),
    challengeGroups: document.getElementById("challenge-groups"),
    lessonList: document.getElementById("lesson-list"),
    scoreboardList: document.getElementById("scoreboard-list"),
    runtimeBanner: document.getElementById("runtime-banner"),
    modalBackdrop: document.getElementById("modal-backdrop"),
    modalBody: document.getElementById("modal-body"),
    modalTitle: document.getElementById("modal-title"),
    modalDifficulty: document.getElementById("modal-difficulty"),
    modalPoints: document.getElementById("modal-points"),
    toastStack: document.getElementById("toast-stack"),
    headerScore: document.getElementById("hdr-score"),
    headerSolved: document.getElementById("hdr-solved"),
    headerTotal: document.getElementById("hdr-total"),
    progressText: document.getElementById("progress-text"),
    progressFill: document.getElementById("progress-fill"),
    progressCopy: document.getElementById("progress-copy")
  };

  const challengeViews = viewsFactory({ escapeHtml });
  let appState = null;
  let currentPage = "challenges";
  let currentChallengeId = null;
  let modalCleanup = null;
  let closeTimer = 0;

  function detectApiBase() {
    const configured = typeof APP_CONFIG.apiBase === "string" ? APP_CONFIG.apiBase.trim() : "";

    if (configured) {
      return configured.replace(/\/+$/, "");
    }

    if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
      return location.origin;
    }

    return "";
  }

  function getStoredSession() {
    try {
      return window.localStorage.getItem(SESSION_STORAGE_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  function setStoredSession(value) {
    if (!value) {
      return;
    }

    try {
      window.localStorage.setItem(SESSION_STORAGE_KEY, value);
    } catch (error) {
      return;
    }
  }

  function clearStoredSession() {
    try {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (error) {
      return;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function paragraphs(lines) {
    return (Array.isArray(lines) ? lines : [lines]).map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  }

  function codeBlock(text) {
    return `<div class="code-block">${escapeHtml(text || "(empty)")}</div>`;
  }

  function flagBox(flag) {
    return `
      <div class="flag-box">
        <span>Flag captured</span>
        <code>${escapeHtml(flag)}</code>
      </div>
    `;
  }

  function table(columns, rows) {
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows
              .map((row) => `
                <tr>${columns.map((column) => `<td>${escapeHtml(row[column.key] ?? "")}</td>`).join("")}</tr>
              `)
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function apiUrl(path, options = {}) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(normalizedPath, API_BASE || location.origin);

    if (options.session) {
      const sessionId = getStoredSession();

      if (sessionId) {
        url.searchParams.set("sid", sessionId);
      }
    }

    return url.toString();
  }

  function showToast(title, detail) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span>`;
    els.toastStack.appendChild(toast);
    window.setTimeout(() => {
      toast.remove();
    }, 3200);
  }

  function setPage(name) {
    currentPage = name;
    els.pages.forEach((page) => {
      page.classList.toggle("is-active", page.id === `${name}-page`);
    });
    els.navButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.nav === name);
    });
  }

  function progressMessage(count) {
    if (!appState) {
      return "Wire the frontend to your Worker API and the live labs will appear here.";
    }

    if (count === 0) {
      return "Start with recon and trust bugs, then work into injection and access control.";
    }

    if (count < 5) {
      return "Good start. Solve state is now tracked by the backend instead of the browser alone.";
    }

    if (count < 10) {
      return "You are in the middle of the board now. The better labs should feel much closer to a real target.";
    }

    if (count < appState.totalChallenges) {
      return "Strong run. Finish the hard labs to complete the whole training queue.";
    }

    return "Full clear. Every lesson is unlocked and every server-side flag is captured.";
  }

  function setRuntimeBanner(kind) {
    if (kind === "file") {
      els.runtimeBanner.innerHTML = `
        <section class="setup-panel">
          <p class="eyebrow">http required</p>
          <h2>This version is meant to run over HTTP, not directly from <code>file://</code>.</h2>
          <p>GitHub Pages can host the frontend for free, but the real solve checks still need a backend. Use GitHub Pages for the UI and point <code>config.js</code> at a Cloudflare Worker.</p>
          <div class="setup-steps">
            <div class="code-block">window.HACKLAB_CONFIG = {\n  apiBase: "https://your-worker-name.your-subdomain.workers.dev"\n};</div>
          </div>
        </section>
      `;
      return;
    }

    if (kind === "missing-api") {
      els.runtimeBanner.innerHTML = `
        <section class="setup-panel">
          <p class="eyebrow">api base missing</p>
          <h2>The frontend loaded, but no Cloudflare API URL is configured yet.</h2>
          <p>Edit <code>config.js</code> or copy <code>config.example.js</code> into it and set <code>apiBase</code> to your deployed Worker URL.</p>
          <div class="setup-steps">
            <div class="code-block">window.HACKLAB_CONFIG = {\n  apiBase: "https://your-worker-name.your-subdomain.workers.dev"\n};</div>
          </div>
        </section>
      `;
      return;
    }

    if (kind === "offline") {
      els.runtimeBanner.innerHTML = `
        <section class="setup-panel">
          <p class="eyebrow">api unavailable</p>
          <h2>The UI loaded, but the HackLab API did not respond.</h2>
          <p>Double-check your Worker deployment, the configured <code>apiBase</code>, and whether the D1 database binding is attached.</p>
          <div class="setup-steps">
            <div class="code-block">${escapeHtml(API_BASE || "https://your-worker-name.your-subdomain.workers.dev")}</div>
          </div>
        </section>
      `;
      return;
    }

    els.runtimeBanner.innerHTML = "";
  }

  async function request(options) {
    if (!IS_API_CONFIGURED) {
      throw new Error("HackLab API base is not configured.");
    }

    const init = {
      method: options.method || "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        ...(options.headers || {})
      }
    };
    const sessionId = getStoredSession();

    if (sessionId) {
      init.headers["X-HackLab-Session"] = sessionId;
    }

    if (options.json !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.json);
    } else if (options.body !== undefined) {
      init.body = options.body;
    }

    const response = await fetch(apiUrl(options.path, options.urlOptions), init);
    const issuedSession = response.headers.get("x-hacklab-session");
    const text = await response.text();
    let json = null;

    if (issuedSession) {
      setStoredSession(issuedSession);
    }

    try {
      if ((response.headers.get("content-type") || "").includes("application/json")) {
        json = text ? JSON.parse(text) : null;
      }
    } catch (error) {
      json = null;
    }

    if (json && json.sessionId) {
      setStoredSession(json.sessionId);
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Array.from(response.headers.entries()),
      text,
      json
    };
  }

  function resolveTarget(target) {
    if (target instanceof HTMLElement) {
      return target;
    }

    return els.modalBody.querySelector(`[data-output="${target}"]`);
  }

  function setOutput(target, tone, html) {
    const element = resolveTarget(target);

    if (!element) {
      return;
    }

    element.className = `panel-output${tone ? ` ${tone}` : ""}`;
    element.innerHTML = html;
  }

  function renderHttp(target, result, options = {}) {
    const headersText = [`HTTP ${result.status} ${result.statusText}`]
      .concat(result.headers.map(([name, value]) => `${name}: ${value}`))
      .join("\n");
    const bodyText = result.json ? JSON.stringify(result.json, null, 2) : (result.text || "(empty body)");
    const tone = options.tone || (result.ok ? "info" : "error");
    const extraHtml = options.extraHtml || "";

    setOutput(target, tone, `${codeBlock(headersText)}${codeBlock(bodyText)}${extraHtml}`);
  }

  function challengeById(id) {
    if (!appState) {
      return null;
    }

    return appState.challenges.find((challenge) => challenge.id === Number(id)) || null;
  }

  function groupChallenges() {
    if (!appState) {
      return [];
    }

    return [
      {
        key: "easy",
        title: "Easy",
        copy: "Recon, weak credentials, and trust bugs that mirror common real-world mistakes."
      },
      {
        key: "medium",
        title: "Medium",
        copy: "Injection and authorization problems that require a little more attacker workflow."
      },
      {
        key: "hard",
        title: "Hard",
        copy: "Longer exploit chains that should feel closer to an actual web CTF target."
      }
    ].map((group) => ({
      ...group,
      items: appState.challenges.filter((challenge) => challenge.difficulty === group.key)
    }));
  }

  function renderChallengeCards() {
    if (!appState) {
      els.challengeGroups.innerHTML = "";
      return;
    }

    els.challengeGroups.innerHTML = groupChallenges()
      .map((group) => `
        <section class="challenge-group">
          <div class="group-head">
            <p class="eyebrow">${escapeHtml(group.key)}</p>
            <h2>${escapeHtml(group.title)} Labs</h2>
            <p>${escapeHtml(group.copy)}</p>
          </div>
          <div class="challenge-grid">
            ${group.items
              .map((challenge) => `
                <article class="challenge-card">
                  <div class="challenge-meta">
                    <span class="badge ${escapeHtml(challenge.difficulty)}">${escapeHtml(challenge.difficulty)}</span>
                    <span class="state-pill ${challenge.solved ? "solved" : ""}">${challenge.solved ? "Solved" : "Open"}</span>
                  </div>
                  <div>
                    <h3>${escapeHtml(challenge.title)}</h3>
                    <p>${escapeHtml(challenge.summary)}</p>
                  </div>
                  <footer>
                    <span class="challenge-points">${challenge.points} pts</span>
                    <button class="challenge-open" type="button" data-open-challenge="${challenge.id}">${challenge.solved ? "Review lab" : "Launch lab"}</button>
                  </footer>
                </article>
              `)
              .join("")}
          </div>
        </section>
      `)
      .join("");
  }

  function renderLessons() {
    if (!appState) {
      els.lessonList.innerHTML = "";
      return;
    }

    els.lessonList.innerHTML = appState.challenges
      .map((challenge) => {
        if (!challenge.solved) {
          return `
            <article class="lesson-card locked">
              <div class="lesson-meta">
                <span class="badge ${escapeHtml(challenge.difficulty)}">${escapeHtml(challenge.difficulty)}</span>
                <span class="state-pill">Locked</span>
              </div>
              <div class="lesson-copy">
                <h3>${escapeHtml(challenge.title)}</h3>
                <p>${escapeHtml(challenge.lesson.summary)}</p>
              </div>
              <footer>
                <span class="lock-copy">Solve the lab to unlock the writeup.</span>
                <button class="lesson-open" type="button" data-open-challenge="${challenge.id}">Open lab</button>
              </footer>
            </article>
          `;
        }

        return `
          <article class="lesson-card">
            <div class="lesson-meta">
              <span class="badge ${escapeHtml(challenge.difficulty)}">${escapeHtml(challenge.difficulty)}</span>
              <span class="state-pill solved">Unlocked</span>
            </div>
            <div class="lesson-copy">
              <h3>${escapeHtml(challenge.title)}</h3>
              <p>${escapeHtml(challenge.lesson.summary)}</p>
            </div>
            <div class="lesson-sections">
              <section class="lesson-section">
                <h4>Exploit Flow</h4>
                <p>${escapeHtml(challenge.lesson.exploit)}</p>
              </section>
              <section class="lesson-section">
                <h4>Real Fix</h4>
                <p>${escapeHtml(challenge.lesson.defense)}</p>
              </section>
            </div>
            <footer>
              <span class="lesson-points">${escapeHtml(challenge.flag)}</span>
              <button class="lesson-open" type="button" data-open-challenge="${challenge.id}">Reopen lab</button>
            </footer>
          </article>
        `;
      })
      .join("");
  }

  function renderScoreboard() {
    if (!appState) {
      els.scoreboardList.innerHTML = "";
      return;
    }

    els.scoreboardList.innerHTML = appState.scoreboard
      .map((entry) => `
        <div class="scoreboard-row ${entry.isUser ? "you" : ""}">
          <span>${entry.rank}</span>
          <strong>${escapeHtml(entry.name)}</strong>
          <span>${entry.score}</span>
        </div>
      `)
      .join("");
  }

  function refreshStats() {
    if (!appState) {
      els.headerScore.textContent = "0";
      els.headerSolved.textContent = "0";
      els.headerTotal.textContent = "15";
      els.progressText.textContent = "0 / 15 solved";
      els.progressFill.style.width = "0%";
      els.progressCopy.textContent = "Wire the frontend to your Worker API and the live labs will appear here.";
      return;
    }

    els.headerScore.textContent = String(appState.score);
    els.headerSolved.textContent = String(appState.solvedCount);
    els.headerTotal.textContent = String(appState.totalChallenges);
    els.progressText.textContent = `${appState.solvedCount} / ${appState.totalChallenges} solved`;
    els.progressFill.style.width = `${(appState.solvedCount / appState.totalChallenges) * 100}%`;
    els.progressCopy.textContent = progressMessage(appState.solvedCount);
  }

  function refreshApp() {
    refreshStats();
    renderChallengeCards();
    renderLessons();
    renderScoreboard();
  }

  async function syncState() {
    const result = await request({ path: "/api/bootstrap" });

    if (!result.ok || !result.json) {
      throw new Error("Could not refresh application state.");
    }

    if (result.json.sessionId) {
      setStoredSession(result.json.sessionId);
    }

    appState = result.json;
    refreshApp();
    return appState;
  }

  function closeModal() {
    window.clearTimeout(closeTimer);

    if (typeof modalCleanup === "function") {
      modalCleanup();
      modalCleanup = null;
    }

    currentChallengeId = null;
    els.modalBody.innerHTML = "";
    els.modalBackdrop.classList.remove("is-open");
    closeTimer = window.setTimeout(() => {
      els.modalBackdrop.hidden = true;
    }, 180);
  }

  function buildApi(challenge) {
    return {
      challenge,
      apiBase: API_BASE,
      escapeHtml,
      paragraphs,
      codeBlock,
      flagBox,
      table,
      request,
      renderHttp,
      sync: syncState,
      apiUrl,
      isSameOriginApi: IS_SAME_ORIGIN_API,
      getSessionId: getStoredSession,
      clearSession: clearStoredSession,
      getChallenge(id = challenge.id) {
        return challengeById(id);
      },
      isSolved(id = challenge.id) {
        const current = challengeById(id);
        return Boolean(current && current.solved);
      },
      messageText(target, tone, lines) {
        setOutput(target, tone, paragraphs(lines));
      },
      messageHtml(target, tone, html) {
        setOutput(target, tone, html);
      },
      listenMessages(handler) {
        window.addEventListener("message", handler);
        return () => {
          window.removeEventListener("message", handler);
        };
      },
      showToast
    };
  }

  function openChallenge(id) {
    const challenge = challengeById(id);
    const view = challengeViews[Number(id)];

    if (!challenge || !view) {
      return;
    }

    if (typeof modalCleanup === "function") {
      modalCleanup();
      modalCleanup = null;
    }

    window.clearTimeout(closeTimer);
    currentChallengeId = challenge.id;
    els.modalTitle.textContent = challenge.title;
    els.modalDifficulty.textContent = `${challenge.difficulty} lab`;
    els.modalPoints.textContent = `${challenge.points} pts`;

    const api = buildApi(challenge);
    els.modalBody.innerHTML = view.render(challenge, api);

    const cleanup = view.mount(els.modalBody, api, challenge);
    modalCleanup = typeof cleanup === "function" ? cleanup : null;

    els.modalBackdrop.hidden = false;
    requestAnimationFrame(() => {
      els.modalBackdrop.classList.add("is-open");
    });
  }

  async function boot() {
    refreshStats();

    if (location.protocol === "file:") {
      setRuntimeBanner("file");
      return;
    }

    if (!IS_API_CONFIGURED) {
      setRuntimeBanner("missing-api");
      return;
    }

    try {
      await syncState();
      setRuntimeBanner("ready");
    } catch (error) {
      clearStoredSession();
      setRuntimeBanner("offline");
    }
  }

  document.addEventListener("click", (event) => {
    const navButton = event.target.closest("[data-nav]");

    if (navButton) {
      setPage(navButton.dataset.nav);
      return;
    }

    const openButton = event.target.closest("[data-open-challenge]");

    if (openButton) {
      openChallenge(Number(openButton.dataset.openChallenge));
      return;
    }

    if (event.target.closest("[data-close-modal]")) {
      closeModal();
    }
  });

  els.modalBackdrop.addEventListener("click", (event) => {
    if (event.target === els.modalBackdrop) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.modalBackdrop.hidden) {
      closeModal();
    }
  });

  setPage(currentPage);
  boot();
})();
