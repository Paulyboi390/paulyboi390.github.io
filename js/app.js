(() => {
  const STORAGE_KEY = "hacklab-state-v2";
  const SCOREBOARD_BASE = [
    { name: "packetmancer", score: 3050 },
    { name: "heap_ghost", score: 2525 },
    { name: "csrf_cartel", score: 2140 },
    { name: "void_runner", score: 1860 },
    { name: "unionized", score: 1435 }
  ];

  const els = {
    navButtons: Array.from(document.querySelectorAll("[data-nav]")),
    pages: Array.from(document.querySelectorAll(".page")),
    challengeGroups: document.getElementById("challenge-groups"),
    lessonList: document.getElementById("lesson-list"),
    scoreboardList: document.getElementById("scoreboard-list"),
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

  const createChallengeSet = window.createHackLabChallenges;

  if (typeof createChallengeSet !== "function") {
    throw new Error("Challenge factory failed to load.");
  }

  delete window.createHackLabChallenges;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function randomSeed() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function seedHex(label) {
    const source = `${state.seed}:${label}`;
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    let h3 = 0x85ebca6b;
    let h4 = 0xc2b2ae35;

    for (let index = 0; index < source.length; index += 1) {
      const code = source.charCodeAt(index);
      h1 = Math.imul(h1 ^ code, 0x01000193);
      h2 = Math.imul(h2 ^ code, 0x27d4eb2d);
      h3 = Math.imul(h3 ^ code, 0x165667b1);
      h4 = Math.imul(h4 ^ code, 0x85ebca77);
    }

    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0]
      .map((part) => part.toString(16).padStart(8, "0"))
      .join("");
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function freshState() {
    return {
      version: 2,
      seed: randomSeed(),
      solved: {}
    };
  }

  let state = loadState();

  if (!state || state.version !== 2 || !state.seed || typeof state.solved !== "object") {
    state = freshState();
    saveState();
  }

  const challenges = createChallengeSet({ escapeHtml, seedHex });
  const challengeMap = new Map(challenges.map((challenge) => [challenge.id, challenge]));
  const awardQueue = new Map();
  let currentPage = "challenges";
  let currentChallengeId = null;
  let modalCleanup = null;
  let closeTimer = 0;

  function encodeUtf8(value) {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(value);
    }

    const encoded = unescape(encodeURIComponent(value));
    return Uint8Array.from(encoded, (char) => char.charCodeAt(0));
  }

  async function hashHex(value) {
    if (!globalThis.crypto || !globalThis.crypto.subtle || typeof globalThis.crypto.subtle.digest !== "function") {
      return `${seedHex(value)}${seedHex(`fallback:${value}`)}`.slice(0, 64);
    }

    const encoded = encodeUtf8(value);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function deriveFlag(challenge) {
    const hash = await hashHex(`${state.seed}:${challenge.id}:${challenge.slug}:${challenge.points}`);
    return `FLAG{${challenge.slug.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_${hash.slice(0, 10).toUpperCase()}}`;
  }

  function challengeSolved(id) {
    return Boolean(state.solved[id]);
  }

  function solvedCount() {
    return Object.keys(state.solved).length;
  }

  function totalScore() {
    return challenges.reduce((sum, challenge) => sum + (challengeSolved(challenge.id) ? challenge.points : 0), 0);
  }

  function progressMessage(count) {
    if (count === 0) {
      return "Start with the easy labs and build momentum.";
    }

    if (count < 5) {
      return "Good start. The lessons page will fill in as you clear more bugs.";
    }

    if (count < 10) {
      return "You are in the middle of the board now. The harder exploit chains should feel more rewarding.";
    }

    if (count < challenges.length) {
      return "Strong run. Finish the remaining hard labs to complete the full training set.";
    }

    return "Full clear. Every lesson is unlocked and every flag has been captured.";
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

  function groupChallenges() {
    return [
      {
        key: "easy",
        title: "Easy",
        copy: "Recon, weak credentials, and simple trust bugs."
      },
      {
        key: "medium",
        title: "Medium",
        copy: "Input injection and authorization flaws that need a bit more intent."
      },
      {
        key: "hard",
        title: "Hard",
        copy: "Longer exploit paths that reward careful observation and real attacker workflow."
      }
    ].map((group) => ({
      ...group,
      items: challenges.filter((challenge) => challenge.difficulty === group.key)
    }));
  }

  function renderChallengeCards() {
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
              .map((challenge) => {
                const solved = challengeSolved(challenge.id);

                return `
                  <article class="challenge-card">
                    <div class="challenge-meta">
                      <span class="badge ${escapeHtml(challenge.difficulty)}">${escapeHtml(challenge.difficulty)}</span>
                      <span class="state-pill ${solved ? "solved" : ""}">${solved ? "Solved" : "Open"}</span>
                    </div>
                    <div>
                      <h3>${escapeHtml(challenge.title)}</h3>
                      <p>${escapeHtml(challenge.summary)}</p>
                    </div>
                    <footer>
                      <span class="challenge-points">${challenge.points} pts</span>
                      <button class="challenge-open" type="button" data-open-challenge="${challenge.id}">${solved ? "Review lab" : "Launch lab"}</button>
                    </footer>
                  </article>
                `;
              })
              .join("")}
          </div>
        </section>
      `)
      .join("");
  }

  function renderLessons() {
    els.lessonList.innerHTML = challenges
      .map((challenge) => {
        const solved = challengeSolved(challenge.id);
        const record = state.solved[challenge.id];

        if (!solved) {
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
              <span class="lesson-points">${escapeHtml(record.flag)}</span>
              <button class="lesson-open" type="button" data-open-challenge="${challenge.id}">Reopen lab</button>
            </footer>
          </article>
        `;
      })
      .join("");
  }

  function renderScoreboard() {
    const userScore = totalScore();
    const board = [...SCOREBOARD_BASE, { name: "you", score: userScore, isUser: true }]
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
      .map((entry, index) => ({ ...entry, rank: index + 1 }));

    els.scoreboardList.innerHTML = board
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
    const score = totalScore();
    const count = solvedCount();
    const total = challenges.length;

    els.headerScore.textContent = String(score);
    els.headerSolved.textContent = String(count);
    els.headerTotal.textContent = String(total);
    els.progressText.textContent = `${count} / ${total} solved`;
    els.progressFill.style.width = `${(count / total) * 100}%`;
    els.progressCopy.textContent = progressMessage(count);
  }

  function refreshApp() {
    refreshStats();
    renderChallengeCards();
    renderLessons();
    renderScoreboard();
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

  function renderParagraphs(lines) {
    return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  }

  function renderFlagBox(flag) {
    return `
      <div class="flag-box">
        <span>Flag captured</span>
        <code>${escapeHtml(flag)}</code>
      </div>
    `;
  }

  async function awardChallenge(challenge) {
    if (challengeSolved(challenge.id)) {
      return state.solved[challenge.id].flag;
    }

    if (awardQueue.has(challenge.id)) {
      return awardQueue.get(challenge.id);
    }

    const pending = (async () => {
      const flag = await deriveFlag(challenge);
      state.solved[challenge.id] = {
        flag,
        solvedAt: new Date().toISOString()
      };
      saveState();
      refreshApp();
      showToast("Flag captured", `${challenge.title} cleared and lesson unlocked.`);
      return flag;
    })();

    awardQueue.set(challenge.id, pending);

    try {
      return await pending;
    } finally {
      awardQueue.delete(challenge.id);
    }
  }

  function buildApi(challenge) {
    return {
      challenge,
      isSolved() {
        return challengeSolved(challenge.id);
      },
      messageText(target, tone, lines) {
        const payload = Array.isArray(lines) ? lines : [lines];
        setOutput(target, tone, renderParagraphs(payload));
      },
      messageHtml(target, tone, html) {
        setOutput(target, tone, html);
      },
      async captureText(target, lines) {
        const flag = await awardChallenge(challenge);
        const payload = Array.isArray(lines) ? lines : [lines];
        setOutput(target, "success", `${renderParagraphs(payload)}${renderFlagBox(flag)}`);
        return flag;
      },
      async captureHtml(target, html) {
        const flag = await awardChallenge(challenge);
        setOutput(target, "success", `${html}${renderFlagBox(flag)}`);
        return flag;
      },
      listenWindow(eventName, handler) {
        window.addEventListener(eventName, handler);
        return () => {
          window.removeEventListener(eventName, handler);
        };
      }
    };
  }

  function openChallenge(id) {
    const challenge = challengeMap.get(Number(id));

    if (!challenge) {
      return;
    }

    if (typeof modalCleanup === "function") {
      modalCleanup();
      modalCleanup = null;
    }

    window.clearTimeout(closeTimer);
    currentChallengeId = challenge.id;
    const record = state.solved[challenge.id];

    els.modalTitle.textContent = challenge.title;
    els.modalDifficulty.textContent = `${challenge.difficulty} lab`;
    els.modalPoints.textContent = `${challenge.points} pts`;
    els.modalBody.innerHTML = challenge.render({
      solved: Boolean(record),
      flag: record ? record.flag : ""
    });

    const cleanup = challenge.mount(els.modalBody, buildApi(challenge));
    modalCleanup = typeof cleanup === "function" ? cleanup : null;

    els.modalBackdrop.hidden = false;
    requestAnimationFrame(() => {
      els.modalBackdrop.classList.add("is-open");
    });
  }

  document.addEventListener("click", (event) => {
    const navButton = event.target.closest("[data-nav]");

    if (navButton) {
      setPage(navButton.dataset.nav);
      return;
    }

    const openButton = event.target.closest("[data-open-challenge]");

    if (openButton) {
      openChallenge(openButton.dataset.openChallenge);
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

  refreshApp();
  setPage(currentPage);
})();
