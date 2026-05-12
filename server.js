const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT || "8787", 10);
const ROOT = __dirname;

const CHALLENGES = [
  {
    id: 1,
    slug: "open-secrets",
    title: "01 - Open Secrets",
    difficulty: "easy",
    points: 100,
    summary: "Find a clue that was accidentally shipped in the raw page source.",
    lesson: {
      summary: "Anything sent to the browser should be considered public. HTML comments, inline JSON, and bundles are all recon surfaces.",
      exploit: "The attacker reads the raw HTML, notices a leaked recon note, and uses it as proof that shipped source can disclose internal details.",
      defense: "Strip debug notes from production builds and keep secrets or operational breadcrumbs off the client entirely."
    }
  },
  {
    id: 2,
    slug: "cookie-monster",
    title: "02 - Cookie Monster",
    difficulty: "easy",
    points: 100,
    summary: "The app trusts a user-controlled role cookie without verifying it.",
    lesson: {
      summary: "Authorization data in client-controlled cookies is untrusted input unless you verify integrity on the server.",
      exploit: "The attacker edits the role cookie in the browser and asks the server to trust the tampered value.",
      defense: "Keep authorization server-side or sign and verify every security-sensitive cookie before using it."
    }
  },
  {
    id: 3,
    slug: "locked-door",
    title: "03 - Locked Door",
    difficulty: "easy",
    points: 100,
    summary: "A leaked backup file exposes admin credentials hidden behind weak encoding.",
    lesson: {
      summary: "Encoding is not protection. Reversible transforms only hide secrets from casual readers, not from attackers.",
      exploit: "The attacker downloads the exposed backup file, decodes the admin password, and signs into the console.",
      defense: "Never publish credential backups, even encoded. Secrets belong in protected server-side storage."
    }
  },
  {
    id: 4,
    slug: "hidden-in-plain-sight",
    title: "04 - Hidden in Plain Sight",
    difficulty: "easy",
    points: 100,
    summary: "A custom response header leaks a debug token.",
    lesson: {
      summary: "Headers often reveal versions, routing, and debugging data that attackers can chain into more serious issues.",
      exploit: "The attacker inspects a real response, spots a suspicious custom header, and extracts the leaked token.",
      defense: "Keep production headers minimal and remove anything that exists only for debugging or internal tracing."
    }
  },
  {
    id: 5,
    slug: "robots-txt",
    title: "05 - robots.txt",
    difficulty: "easy",
    points: 100,
    summary: "robots.txt reveals a hidden archive route that was never protected properly.",
    lesson: {
      summary: "robots.txt is only a crawler hint. It is not authentication, authorization, or secrecy.",
      exploit: "The attacker reads robots.txt, sees a disallowed route, and requests it directly.",
      defense: "Use real access control on sensitive content and avoid publishing internal routes in crawler directives."
    }
  },
  {
    id: 6,
    slug: "default-creds",
    title: "06 - Default Creds",
    difficulty: "easy",
    points: 150,
    summary: "A monitoring appliance still accepts factory credentials.",
    lesson: {
      summary: "Default credentials remain one of the fastest paths into exposed services and forgotten appliances.",
      exploit: "The attacker tries common factory pairs until the dashboard grants access.",
      defense: "Force credential rotation on deployment and audit legacy systems that may still be using defaults."
    }
  },
  {
    id: 7,
    slug: "reflected-xss",
    title: "07 - Reflected XSS",
    difficulty: "medium",
    points: 200,
    summary: "A search page reflects attacker input into the DOM without sanitization.",
    lesson: {
      summary: "Reflected XSS turns a single response into a script execution primitive whenever untrusted input is inserted as HTML.",
      exploit: "The attacker injects executable markup into the search response and runs code in the victim frame.",
      defense: "Escape untrusted content, prefer text-only rendering APIs, and use a strong Content Security Policy as defense in depth."
    }
  },
  {
    id: 8,
    slug: "sqli-login",
    title: "08 - SQL Injection - Login",
    difficulty: "medium",
    points: 200,
    summary: "A login endpoint builds SQL with string concatenation and can be bypassed.",
    lesson: {
      summary: "When user input changes SQL structure, attackers can bypass authentication and rewrite query logic.",
      exploit: "The attacker breaks out of the username string and comments away or neutralizes the password check.",
      defense: "Use parameterized queries everywhere so user input never changes the structure of SQL."
    }
  },
  {
    id: 9,
    slug: "sqli-union",
    title: "09 - SQL Injection - Extract",
    difficulty: "medium",
    points: 250,
    summary: "A searchable endpoint can be abused with a UNION query to expose another table.",
    lesson: {
      summary: "UNION-based SQLi lets attackers append attacker-chosen rows to otherwise legitimate responses.",
      exploit: "The attacker aligns column counts, unions a second query, and reads internal rows from a secrets table.",
      defense: "Parameterized queries prevent injection, and least-privilege database accounts reduce post-compromise exposure."
    }
  },
  {
    id: 10,
    slug: "jwt-tamper",
    title: "10 - Trust Issues (JWT)",
    difficulty: "medium",
    points: 250,
    summary: "A token payload is trusted without verifying the signature.",
    lesson: {
      summary: "JWTs are only meaningful after signature verification. A decoded payload by itself proves nothing.",
      exploit: "The attacker modifies the token payload, escalates the role, and reuses the original signature because validation never happens.",
      defense: "Always verify JWT signatures and claims before trusting any payload data."
    }
  },
  {
    id: 11,
    slug: "idor",
    title: "11 - IDOR",
    difficulty: "medium",
    points: 200,
    summary: "A profile endpoint exposes other users' records when the numeric ID changes.",
    lesson: {
      summary: "IDOR flaws happen when applications expose object IDs but fail to enforce authorization on each access.",
      exploit: "The attacker changes the profile ID and reads another user's protected record.",
      defense: "Enforce authorization on every object lookup and test for both horizontal and vertical privilege abuse."
    }
  },
  {
    id: 12,
    slug: "stored-xss",
    title: "12 - Stored XSS",
    difficulty: "medium",
    points: 250,
    summary: "A comment board stores HTML and renders it back unsafely for every visitor.",
    lesson: {
      summary: "Stored XSS is persistent. Once malicious content is saved, every future viewer becomes a target.",
      exploit: "The attacker stores a payload in a comment and the board executes it whenever the thread renders.",
      defense: "Escape stored user content on output and sanitize any supported rich text with a trusted library."
    }
  },
  {
    id: 13,
    slug: "path-traversal",
    title: "13 - Path Traversal",
    difficulty: "hard",
    points: 350,
    summary: "A file endpoint strips ../ only once before resolving the path.",
    lesson: {
      summary: "Path traversal happens when user input influences filesystem paths without strict normalization and allowlisting.",
      exploit: "The attacker disguises traversal so a naive replace still leaves a working escape sequence behind.",
      defense: "Resolve paths safely and only serve files from explicit allowlists instead of trusting user-provided locations."
    }
  },
  {
    id: 14,
    slug: "blind-sqli",
    title: "14 - SQL Injection - Blind",
    difficulty: "hard",
    points: 400,
    summary: "A boolean-only endpoint can still leak the admin password one character at a time.",
    lesson: {
      summary: "Blind SQLi is still severe even without visible query results because true or false behavior alone leaks data.",
      exploit: "The attacker asks yes or no questions about each password position and reconstructs the secret character by character.",
      defense: "Parameterized queries stop the injection and uniform error handling reduces information leakage."
    }
  },
  {
    id: 15,
    slug: "broken-access-control",
    title: "15 - Broken Access Control",
    difficulty: "hard",
    points: 400,
    summary: "The API trusts a client-supplied role header instead of deriving authorization server-side.",
    lesson: {
      summary: "Frontend controls do not provide security. If the backend trusts client-supplied identity or role data, privilege escalation is trivial.",
      exploit: "The attacker changes the role header and the API serves protected data because it never checks a trusted session.",
      defense: "Make the backend derive identity and authorization from trusted session state, not caller-controlled headers."
    }
  }
];

const SCOREBOARD_BASE = [
  { name: "packetmancer", score: 3050 },
  { name: "heap_ghost", score: 2525 },
  { name: "csrf_cartel", score: 2140 },
  { name: "void_runner", score: 1860 },
  { name: "unionized", score: 1435 }
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".bak": "text/plain; charset=utf-8",
  ".ico": "image/x-icon"
};

const STATIC_FILES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/HackLab.html", "HackLab.html"],
  ["/styles.css", "styles.css"],
  ["/js/app.js", path.join("js", "app.js")],
  ["/js/challenges.js", path.join("js", "challenges.js")]
]);

const PRODUCTS = [
  { name: "Widget A", price: "$9.99" },
  { name: "Widget B", price: "$14.99" },
  { name: "Gadget Pro", price: "$49.99" },
  { name: "Training Badge", price: "$3.99" }
];

const DEFAULT_PAIRS = [
  ["admin", "admin"],
  ["admin", "password"],
  ["monitor", "monitor"],
  ["backup", "backup"],
  ["root", "toor"]
];

const SESSION_COOKIE = "hl_sid";
const ROLE_COOKIE = "hl_role";
const SOURCE_CLUE = "source-map-owl";

const sessions = new Map();

function randomId(length = 24) {
  return crypto.randomBytes(length).toString("hex");
}

function hashHex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function seedHex(seed, label) {
  return hashHex(`${seed}:${label}`);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseCookies(header = "") {
  return header.split(";").reduce((accumulator, part) => {
    const trimmed = part.trim();

    if (!trimmed) {
      return accumulator;
    }

    const splitAt = trimmed.indexOf("=");
    const name = splitAt >= 0 ? trimmed.slice(0, splitAt) : trimmed;
    const value = splitAt >= 0 ? trimmed.slice(splitAt + 1) : "";
    accumulator[name] = decodeURIComponent(value);
    return accumulator;
  }, {});
}

function appendSetCookie(res, cookie) {
  const current = res.getHeader("Set-Cookie");

  if (!current) {
    res.setHeader("Set-Cookie", [cookie]);
    return;
  }

  res.setHeader("Set-Cookie", Array.isArray(current) ? [...current, cookie] : [current, cookie]);
}

function setCookie(res, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path || "/"}`];

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  appendSetCookie(res, parts.join("; "));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", (chunk) => {
      chunks.push(chunk);
    });

    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const type = (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();

      if (!raw) {
        resolve({});
        return;
      }

      try {
        if (type === "application/json") {
          resolve(JSON.parse(raw));
          return;
        }

        if (type === "application/x-www-form-urlencoded") {
          const params = new URLSearchParams(raw);
          resolve(Object.fromEntries(params.entries()));
          return;
        }

        resolve({ raw });
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function normalizePath(input) {
  const segments = input.split("/").filter(Boolean);
  const stack = [];

  segments.forEach((segment) => {
    if (segment === ".") {
      return;
    }

    if (segment === "..") {
      stack.pop();
      return;
    }

    stack.push(segment);
  });

  return stack.join("/");
}

function createArtifacts(seed) {
  return {
    headerToken: `trace-${seedHex(seed, "header-token").slice(0, 6)}`,
    robotsPath: `/archive-${seedHex(seed, "robots-path").slice(0, 5)}/`,
    adminPassword: `portal-${seedHex(seed, "admin-password").slice(0, 4)}`,
    unionKey: `backup-${seedHex(seed, "union-key").slice(0, 6)}`,
    profileTicket: `vault-${seedHex(seed, "profile-ticket").slice(0, 5)}`,
    pathBundle: `bundle-${seedHex(seed, "path-bundle").slice(0, 6)}`,
    blindPassword: seedHex(seed, "blind-password").replace(/[^a-f0-9]/g, "").slice(0, 8),
    apiSecret: `ops-${seedHex(seed, "api-secret").slice(0, 8)}`,
    jwtSignature: seedHex(seed, "jwt-signature").slice(0, 24)
  };
}

function createSession() {
  const seed = randomId(16);
  return {
    seed,
    createdAt: new Date().toISOString(),
    solved: {},
    comments: [
      { author: "alice", text: "The old monitor still uses factory creds." },
      { author: "bob", text: "Someone should really stop shipping debug notes." }
    ],
    artifacts: createArtifacts(seed)
  };
}

function ensureSession(req, res) {
  const cookies = parseCookies(req.headers.cookie || "");
  let sessionId = cookies[SESSION_COOKIE];

  if (!sessionId || !sessions.has(sessionId)) {
    sessionId = randomId(12);
    sessions.set(sessionId, createSession());
    setCookie(res, SESSION_COOKIE, sessionId, { path: "/", httpOnly: true, sameSite: "Lax" });
  }

  if (!cookies[ROLE_COOKIE]) {
    setCookie(res, ROLE_COOKIE, "guest", { path: "/", sameSite: "Lax" });
    cookies[ROLE_COOKIE] = "guest";
  }

  return { sessionId, session: sessions.get(sessionId), cookies };
}

function totalScore(session) {
  return CHALLENGES.reduce((sum, challenge) => sum + (session.solved[challenge.id] ? challenge.points : 0), 0);
}

function solvedCount(session) {
  return Object.keys(session.solved).length;
}

function deriveFlag(session, challenge) {
  const digest = hashHex(`${session.seed}:${challenge.id}:${challenge.slug}:${challenge.points}`);
  return `FLAG{${challenge.slug.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_${digest.slice(0, 10).toUpperCase()}}`;
}

function award(session, challengeId) {
  if (session.solved[challengeId]) {
    return session.solved[challengeId];
  }

  const challenge = CHALLENGES.find((entry) => entry.id === challengeId);
  const record = {
    flag: deriveFlag(session, challenge),
    solvedAt: new Date().toISOString()
  };

  session.solved[challengeId] = record;
  return record;
}

function buildScoreboard(session) {
  const board = [...SCOREBOARD_BASE, { name: "you", score: totalScore(session), isUser: true }];

  return board
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .map((entry, index) => ({
      rank: index + 1,
      name: entry.name,
      score: entry.score,
      isUser: Boolean(entry.isUser)
    }));
}

function buildBootstrap(session) {
  return {
    app: {
      name: "HackLab",
      runtime: "server"
    },
    score: totalScore(session),
    solvedCount: solvedCount(session),
    totalChallenges: CHALLENGES.length,
    scoreboard: buildScoreboard(session),
    challenges: CHALLENGES.map((challenge) => ({
      ...challenge,
      solved: Boolean(session.solved[challenge.id]),
      flag: session.solved[challenge.id] ? session.solved[challenge.id].flag : null
    }))
  };
}

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function sendJson(res, statusCode, payload, headers = {}) {
  send(res, statusCode, JSON.stringify(payload, null, 2), {
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
}

function sendText(res, statusCode, body, headers = {}) {
  send(res, statusCode, body, {
    "Content-Type": "text/plain; charset=utf-8",
    ...headers
  });
}

function sendHtml(res, statusCode, body, headers = {}) {
  send(res, statusCode, body, {
    "Content-Type": "text/html; charset=utf-8",
    ...headers
  });
}

function solvedHeaders(challengeId) {
  return {
    "X-HackLab-Solved": String(challengeId)
  };
}

function formatJsonMessage(message, extras = {}) {
  return {
    ok: true,
    message: Array.isArray(message) ? message : [message],
    ...extras
  };
}

function formatErrorMessage(message, status = 400, extras = {}) {
  return {
    status,
    payload: {
      ok: false,
      message: Array.isArray(message) ? message : [message],
      ...extras
    }
  };
}

function renderReflectedLab(query = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Search Results</title>
  <style>
    body { margin: 0; font-family: monospace; background: #0b1217; color: #d4e0e7; padding: 20px; }
    .shell { border: 1px solid #21323d; border-radius: 14px; padding: 18px; background: #101920; }
    h1 { margin: 0 0 14px; font-size: 1rem; }
    .result { border: 1px solid #1a2b35; border-radius: 10px; padding: 14px; background: #081015; min-height: 70px; }
    .note { margin-top: 12px; color: #7f98a3; font-size: 0.86rem; }
  </style>
</head>
<body>
  <script>
    window.hacklabOwned = async function () {
      const response = await fetch("/api/xss/reflected/ping", { method: "POST", credentials: "same-origin" });
      const data = await response.json();
      parent.postMessage({ type: "hacklab-solved", challengeId: 7, data }, "*");
    };
  </script>
  <div class="shell">
    <h1>Results for your query</h1>
    <div class="result">${query}</div>
    <p class="note">Legacy renderer loaded results with innerHTML.</p>
  </div>
</body>
</html>`;
}

function renderCommentsLab(session) {
  const comments = session.comments
    .map((comment) => `
      <article style="border:1px solid #1a2b35;border-radius:10px;padding:12px 14px;background:#081015;margin-bottom:10px;">
        <strong style="display:block;margin-bottom:8px;">${escapeHtml(comment.author)}</strong>
        <div>${comment.text}</div>
      </article>
    `)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Announcements</title>
  <style>
    body { margin: 0; font-family: monospace; background: #0b1217; color: #d4e0e7; padding: 20px; }
    .shell { border: 1px solid #21323d; border-radius: 14px; padding: 18px; background: #101920; }
    h1 { margin: 0 0 8px; font-size: 1rem; }
    p { color: #7f98a3; line-height: 1.6; }
  </style>
</head>
<body>
  <script>
    window.hacklabStored = async function () {
      const response = await fetch("/api/xss/stored/ping", { method: "POST", credentials: "same-origin" });
      const data = await response.json();
      parent.postMessage({ type: "hacklab-solved", challengeId: 12, data }, "*");
    };
  </script>
  <div class="shell">
    <h1>Announcements Board</h1>
    <p>Comments are rendered directly from storage for all visitors.</p>
    ${comments || "<p>No comments yet.</p>"}
  </div>
</body>
</html>`;
}

function respondStatic(reqPath, res) {
  const relative = STATIC_FILES.get(reqPath);

  if (!relative) {
    return false;
  }

  const filePath = path.join(ROOT, relative);

  if (!fs.existsSync(filePath)) {
    sendText(res, 404, "Not found.");
    return true;
  }

  const ext = path.extname(filePath).toLowerCase();
  const body = fs.readFileSync(filePath);
  send(res, 200, body, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream"
  });
  return true;
}

function jsonError(res, message, status = 400, extras = {}) {
  sendJson(res, status, {
    ok: false,
    message: Array.isArray(message) ? message : [message],
    ...extras
  });
}

function parseJwtPayload(token) {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = Buffer.from(parts[1], "base64").toString("utf8");
    return JSON.parse(payload);
  } catch (error) {
    return null;
  }
}

function requestPreviewBody(body) {
  if (body == null || body === "") {
    return "(empty body)";
  }

  if (typeof body === "string") {
    return body;
  }

  return JSON.stringify(body, null, 2);
}

async function handleApi(req, res, url, context) {
  const { session, cookies } = context;

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    sendJson(res, 200, buildBootstrap(session));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/challenges/1/verify") {
    const body = await readBody(req);

    if (String(body.clue || "").trim() === SOURCE_CLUE) {
      const record = award(session, 1);
      sendJson(res, 200, formatJsonMessage(
        ["Build clue confirmed.", "You proved that shipped source can leak useful recon."],
        { solved: true, flag: record.flag }
      ));
      return true;
    }

    jsonError(res, ["That clue is not correct.", "Inspect the raw page source and search for recon-note."]);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/whoami") {
    const role = cookies[ROLE_COOKIE] || "guest";

    if (role === "admin") {
      const record = award(session, 2);
      sendJson(res, 200, formatJsonMessage(
        [`Server accepted role=${role}.`, "A client-controlled cookie just escalated privileges."],
        { solved: true, flag: record.flag, role }
      ));
      return true;
    }

    jsonError(res, [`Current role is ${role}.`, "The endpoint only trusts the cookie it receives."], 403, { role });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/login") {
    const body = await readBody(req);
    const username = String(body.username || "");
    const password = String(body.password || "");

    if (username === "admin" && password === session.artifacts.adminPassword) {
      const record = award(session, 3);
      sendJson(res, 200, formatJsonMessage(
        ["Admin console unlocked.", "The leaked backup file disclosed valid credentials."],
        { solved: true, flag: record.flag }
      ));
      return true;
    }

    jsonError(res, ["Access denied.", "The admin password is hidden in the exposed backup file."], 401);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/challenges/4/verify") {
    const body = await readBody(req);
    const token = String(body.token || "").trim();

    if (token === session.artifacts.headerToken) {
      const record = award(session, 4);
      sendJson(res, 200, formatJsonMessage(
        ["Header token confirmed.", "Sensitive debugging metadata leaked through a response header."],
        { solved: true, flag: record.flag }
      ));
      return true;
    }

    jsonError(res, ["That token does not match the leaked response header."], 400);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/default-login") {
    const body = await readBody(req);
    const username = String(body.username || "");
    const password = String(body.password || "");
    const matched = DEFAULT_PAIRS.some(([user, pass]) => user === username && pass === password);

    if (matched) {
      const record = award(session, 6);
      sendJson(res, 200, formatJsonMessage(
        [`Dashboard opened with ${username}/${password}.`, "Factory defaults should never survive deployment."],
        { solved: true, flag: record.flag }
      ));
      return true;
    }

    jsonError(res, ["Invalid credentials.", "This service was never hardened after install."], 401);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/xss/reflected/ping") {
    const record = award(session, 7);
    sendJson(res, 200, formatJsonMessage(
      ["Reflected payload executed in the target frame.", "The victim page accepted attacker-controlled HTML."],
      { solved: true, flag: record.flag }
    ));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/sqli-login") {
    const body = await readBody(req);
    const username = String(body.username || "");
    const password = String(body.password || "");
    const query = `SELECT * FROM users WHERE username='${username}' AND password='${password}'`;
    const lower = username.toLowerCase();
    const bypass =
      /'\s*or\s*'?1'?='?1/i.test(lower) ||
      /'\s*or\s*'[^']*'='[^']*/i.test(lower) ||
      /--/.test(username) ||
      /#/.test(username) ||
      /admin'\s*$/i.test(lower);

    if (bypass) {
      const record = award(session, 8);
      sendJson(res, 200, formatJsonMessage(
        ["Authentication bypassed.", "The injected username changed the logic of the SQL query."],
        { solved: true, flag: record.flag, query }
      ));
      return true;
    }

    jsonError(res, ["Login failed.", "The endpoint is vulnerable because input changes the query structure."], 401, { query });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/products") {
    const raw = String(url.searchParams.get("q") || "");
    const query = `SELECT name, price FROM products WHERE name LIKE '%${raw}%'`;
    const unionMatch = /'\s*union\s+select\s+(.+?)\s+from\s+(\w+)\s*(?:--|#)?/i.exec(raw);

    if (unionMatch) {
      const columns = unionMatch[1].split(",").map((entry) => entry.trim()).filter(Boolean);
      const table = unionMatch[2].toLowerCase();

      if (columns.length !== 2) {
        jsonError(res, ["SQL error: column count mismatch.", "The original query returns exactly two columns."], 400, { query });
        return true;
      }

      if (table === "secrets") {
        const record = award(session, 9);
        sendJson(res, 200, formatJsonMessage(
          ["UNION query succeeded.", "Rows from the secrets table were appended to the original result set."],
          {
            solved: true,
            flag: record.flag,
            query,
            rows: [
              { note: `backup_key=${session.artifacts.unionKey}`, level: "internal" },
              { note: "legacy export path=/srv/archive", level: "ops" },
              { note: "rotation disabled on monitor-02", level: "warning" }
            ]
          }
        ));
        return true;
      }

      jsonError(res, [`Table ${table} is not readable here.`, "Try reaching the secrets table instead."], 404, { query });
      return true;
    }

    if (raw.includes("'")) {
      jsonError(res, ["SQL syntax error near your quote.", "The server concatenated raw input into the query."], 400, { query });
      return true;
    }

    const rows = PRODUCTS.filter((product) => product.name.toLowerCase().includes(raw.toLowerCase()));
    sendJson(res, 200, formatJsonMessage(
      rows.length ? ["Search executed successfully."] : ["No products matched that search."],
      { query, rows }
    ));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/jwt-token") {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64");
    const payload = Buffer.from(JSON.stringify({ user: "guest", role: "user", exp: 2099999999 })).toString("base64");
    const token = `${header}.${payload}.${session.artifacts.jwtSignature}`;
    sendJson(res, 200, formatJsonMessage("Token issued.", { token }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/jwt-check") {
    const body = await readBody(req);
    const token = String(body.token || "");
    const payload = parseJwtPayload(token);

    if (!payload) {
      jsonError(res, ["Could not decode the token payload.", "Keep the token in header.payload.signature format."], 400);
      return true;
    }

    if (payload.role === "admin") {
      const record = award(session, 10);
      sendJson(res, 200, formatJsonMessage(
        ["Admin role accepted from token payload.", "The server never verified the JWT signature."],
        { solved: true, flag: record.flag, payload }
      ));
      return true;
    }

    jsonError(res, [`Role is ${payload.role || "(missing)"}.`, "Escalate the payload to admin."], 403, { payload });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/profile") {
    const profiles = [
      { id: 1001, username: "you", email: "you@hacklab.local", bio: "Lab runner account." },
      { id: 1002, username: "alice", email: "alice@hacklab.local", bio: "Security engineer." },
      { id: 1003, username: "admin", email: "admin@hacklab.local", bio: `vault_ticket=${session.artifacts.profileTicket}` },
      { id: 1004, username: "ops", email: "ops@hacklab.local", bio: "Pager duty this week." }
    ];
    const id = Number.parseInt(url.searchParams.get("id") || "", 10);
    const profile = profiles.find((entry) => entry.id === id);

    if (!profile) {
      jsonError(res, [`No profile found for id=${Number.isNaN(id) ? "invalid" : id}.`], 404);
      return true;
    }

    const payload = formatJsonMessage(`Profile ${profile.id} returned.`, { profile });

    if (profile.username === "admin") {
      const record = award(session, 11);
      payload.solved = true;
      payload.flag = record.flag;
    }

    sendJson(res, 200, payload);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/comments") {
    const body = await readBody(req);
    const author = String(body.author || "").trim() || "anonymous";
    const text = String(body.text || "");

    if (!text.trim()) {
      jsonError(res, ["Comment body cannot be empty."], 400);
      return true;
    }

    session.comments.push({ author, text });
    sendJson(res, 200, formatJsonMessage(
      ["Comment stored.", "Reload or revisit the board to see how comments render for every visitor."]
    ));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/xss/stored/ping") {
    const record = award(session, 12);
    sendJson(res, 200, formatJsonMessage(
      ["Stored payload executed for a visitor.", "Unsafe HTML from storage became executable script."],
      { solved: true, flag: record.flag }
    ));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/file") {
    const raw = String(url.searchParams.get("path") || "");
    const sanitized = raw.replace("../", "");
    const resolved = normalizePath(`public/${sanitized}`);
    const files = {
      "public/readme.txt": "HackLab file server\nOnly public docs should live here.",
      "public/docs/guide.txt": "Guide\nUse the challenge cards to launch each lab.",
      "public/docs/faq.txt": "FAQ\nQ: Is the sanitizer safe?\nA: Not remotely.",
      "private/secret.txt": `forensic_bundle=${session.artifacts.pathBundle}\nYou escaped the public directory.`
    };

    if (files[resolved]) {
      if (resolved === "private/secret.txt") {
        award(session, 13);
        sendText(res, 200, files[resolved], solvedHeaders(13));
        return true;
      }

      sendText(res, 200, files[resolved], {
        "X-HackLab-Resolved-Path": resolved
      });
      return true;
    }

    if (raw.includes("../")) {
      sendText(res, 403, `Traversal detected.\nAfter single replace: ${sanitized}\nResolved path: ${resolved}`, {
        "X-HackLab-Resolved-Path": resolved
      });
      return true;
    }

    sendText(res, 404, `Not found.\nResolved path: ${resolved}`, {
      "X-HackLab-Resolved-Path": resolved
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/blind-user") {
    const raw = String(url.searchParams.get("username") || "");
    const probePattern = /^([a-z0-9_]+)'\s+AND\s+(?:SUBSTR|SUBSTRING)\(password,\s*(\d+),\s*1\)\s*=\s*'(.{1})'\s*(?:--|#)$/i;
    const match = probePattern.exec(raw);

    if (match) {
      const username = match[1];
      const index = Number.parseInt(match[2], 10) - 1;
      const guess = match[3];
      const correct = username === "admin" && session.artifacts.blindPassword[index] === guess;

      if (correct) {
        sendJson(res, 200, formatJsonMessage(
          [`Condition evaluated TRUE. Character ${index + 1} matches ${guess}.`],
          { probe: raw }
        ));
        return true;
      }

      jsonError(res, ["Condition evaluated FALSE."], 404, { probe: raw });
      return true;
    }

    if (raw.includes("'")) {
      jsonError(res, ["Malformed SQL syntax."], 500, { probe: raw });
      return true;
    }

    if (raw === "admin") {
      sendJson(res, 200, formatJsonMessage("Username exists.", { probe: raw }));
      return true;
    }

    jsonError(res, ["User not found."], 404, { probe: raw });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/blind-verify") {
    const body = await readBody(req);
    const password = String(body.password || "").trim();

    if (password === session.artifacts.blindPassword) {
      const record = award(session, 14);
      sendJson(res, 200, formatJsonMessage(
        ["Recovered admin password confirmed.", `admin password = ${password}`],
        { solved: true, flag: record.flag }
      ));
      return true;
    }

    jsonError(res, ["That password is not correct yet."], 400);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/secret") {
    const role = String(req.headers["x-user-role"] || "user");

    if (role === "admin") {
      const record = award(session, 15);
      sendJson(res, 200, formatJsonMessage(
        ["Protected secret returned.", "The API trusted a caller-controlled role header."],
        {
          solved: true,
          flag: record.flag,
          payload: {
            secret: session.artifacts.apiSecret,
            debug: "role header was trusted"
          }
        }
      ));
      return true;
    }

    jsonError(res, [`Role ${role} is not authorized.`], 403);
    return true;
  }

  return false;
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const context = ensureSession(req, res);

  if (req.method === "GET" && url.pathname === "/backup-config.bak") {
    sendText(
      res,
      200,
      `service=admin-panel\nadmin_user=admin\nadmin_pass_b64=${Buffer.from(context.session.artifacts.adminPassword).toString("base64")}\nnote=remove before shipping\n`
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/telemetry") {
    sendJson(
      res,
      200,
      {
        queue: "telemetry",
        lag_ms: 42,
        shard: "alpha-2"
      },
      {
        "X-Trace-Token": context.session.artifacts.headerToken,
        "X-Debug-Mode": "partial"
      }
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/robots.txt") {
    sendText(
      res,
      200,
      `User-agent: *\nDisallow: /admin/\nDisallow: ${context.session.artifacts.robotsPath}\nDisallow: /internal-api/\n`
    );
    return;
  }

  if (req.method === "GET" && url.pathname === context.session.artifacts.robotsPath) {
    award(context.session, 5);
    sendHtml(
      res,
      200,
      `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Archive</title></head><body><h1>Archive Index</h1><p>backup catalog still exposed</p><pre>db_backup_2024.sql.gz\nops_exports.tar\nold_notes.txt</pre></body></html>`,
      solvedHeaders(5)
    );
    return;
  }

  if (req.method === "GET" && url.pathname === "/labs/reflected") {
    const query = String(url.searchParams.get("q") || "");
    sendHtml(res, 200, renderReflectedLab(query));
    return;
  }

  if (req.method === "GET" && url.pathname === "/labs/comments") {
    sendHtml(res, 200, renderCommentsLab(context.session));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    try {
      const handled = await handleApi(req, res, url, context);

      if (!handled) {
        jsonError(res, "API endpoint not found.", 404);
      }
    } catch (error) {
      jsonError(res, [`Server error: ${error.message}`], 500);
    }
    return;
  }

  if (respondStatic(url.pathname, res)) {
    return;
  }

  sendText(res, 404, "Not found.");
}

const server = http.createServer((req, res) => {
  handleRequest(req, res);
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`HackLab running at http://${HOST}:${PORT}/HackLab.html\n`);
});
