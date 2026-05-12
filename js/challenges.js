(() => {
  function combineCleanups(cleanups) {
    return () => {
      cleanups.forEach((cleanup) => {
        if (typeof cleanup === "function") {
          cleanup();
        }
      });
    };
  }

  window.createHackLabChallenges = function createHackLabChallenges(runtime) {
    const { escapeHtml, seedHex } = runtime;

    const secrets = {
      headerToken: `trace-${seedHex("header-token").slice(0, 6)}`,
      robotsPath: `/archive-${seedHex("robots-path").slice(0, 5)}/`,
      adminPassword: `portal-${seedHex("admin-password").slice(0, 4)}`,
      unionKey: `backup-${seedHex("union-key").slice(0, 6)}`,
      profileTicket: `vault-${seedHex("profile-ticket").slice(0, 5)}`,
      pathBundle: `bundle-${seedHex("path-bundle").slice(0, 6)}`,
      blindPassword: seedHex("blind-password")
        .replace(/[^a-f0-9]/g, "")
        .slice(0, 8),
      apiSecret: `ops-${seedHex("api-secret").slice(0, 8)}`,
      jwtSignature: seedHex("jwt-signature").slice(0, 24)
    };

    const defaultPairs = [
      ["admin", "admin"],
      ["admin", "password"],
      ["monitor", "monitor"],
      ["backup", "backup"],
      ["root", "toor"]
    ];

    const products = [
      { name: "Widget A", price: "$9.99" },
      { name: "Widget B", price: "$14.99" },
      { name: "Gadget Pro", price: "$49.99" },
      { name: "Training Badge", price: "$3.99" }
    ];

    const secretsTable = [
      { note: `backup_key=${secrets.unionKey}`, level: "internal" },
      { note: "legacy export path=/srv/archive", level: "ops" },
      { note: "rotation disabled on monitor-02", level: "warning" }
    ];

    const profiles = [
      { id: 1001, username: "you", email: "you@hacklab.local", bio: "Lab runner account." },
      { id: 1002, username: "alice", email: "alice@hacklab.local", bio: "Security engineer." },
      { id: 1003, username: "admin", email: "admin@hacklab.local", bio: `vault_ticket=${secrets.profileTicket}` },
      { id: 1004, username: "ops", email: "ops@hacklab.local", bio: "Pager duty this week." }
    ];

    const fileStore = {
      "public/readme.txt": "HackLab file server\nOnly public docs should live here.",
      "public/docs/guide.txt": "Guide: use the challenge cards to launch each lab.",
      "public/docs/faq.txt": "FAQ\nQ: Is the sanitizer safe?\nA: Not remotely.",
      "private/secret.txt": `forensic_bundle=${secrets.pathBundle}\nYou broke out of the public directory.`
    };

    const initialComments = [
      { author: "alice", text: "The old monitor still uses factory creds." },
      { author: "bob", text: "Someone should really stop shipping debug notes." }
    ];
    let comments = initialComments.map((entry) => ({ ...entry }));

    function solvedBanner(view) {
      if (!view.solved || !view.flag) {
        return "";
      }

      return `
        <div class="status-banner success">
          <strong>Already cleared.</strong>
          <span>Captured flag: <code>${escapeHtml(view.flag)}</code></span>
        </div>
      `;
    }

    function renderResponse(headers, body) {
      return `
        <div class="code-block">${escapeHtml(headers)}</div>
        <div class="code-block">${escapeHtml(body)}</div>
      `;
    }

    function sanitizeOnce(value) {
      return value.replace("../", "");
    }

    function normalizePath(value) {
      const parts = value.split("/").filter(Boolean);
      const stack = [];

      parts.forEach((part) => {
        if (part === ".") {
          return;
        }

        if (part === "..") {
          stack.pop();
          return;
        }

        stack.push(part);
      });

      return stack.join("/");
    }

    function renderComments(target) {
      target.innerHTML = `
        <div class="comment-list">
          ${comments
            .map((comment) => `
              <article class="comment-item">
                <strong>${escapeHtml(comment.author)}</strong>
                <div class="comment-body">${comment.text}</div>
              </article>
            `)
            .join("")}
        </div>
      `;
    }

    const challenges = [
      {
        id: 1,
        slug: "open-secrets",
        title: "01 - Open Secrets",
        difficulty: "easy",
        points: 100,
        summary: "Find the build clue that was accidentally shipped in the raw page source.",
        lesson: {
          summary: "Anything shipped to the browser should be treated as public. Source, comments, inline data, and client bundles all become recon material.",
          exploit: "The attacker reads the exact HTML the browser downloaded, finds a leaked build note, and uses it to pivot into the rest of the app.",
          defense: "Strip debug notes from production builds, keep secrets server-side, and review client bundles the same way you review responses from a public API."
        },
        render(view) {
          return `
            <div class="lab-stack">
              ${solvedBanner(view)}
              <p class="lab-copy">A developer left a build clue in the page source. View source for this file and search for <code>recon-note</code>, then prove you found it.</p>
              <div class="lab-callout">This is the only challenge that intentionally rewards source inspection. The rest of the site no longer dumps every answer in one place.</div>
              <div>
                <label class="field-label" for="source-key">Leaked build clue</label>
                <div class="inline-form">
                  <input class="field" id="source-key" type="text" autocomplete="off" placeholder="source-map-...">
                  <button class="action-btn primary" type="button" data-action="verify-source">Verify clue</button>
                </div>
              </div>
              <div class="panel-output" data-output="source">Waiting for a clue from the shipped HTML.</div>
            </div>
          `;
        },
        mount(root, api) {
          const input = root.querySelector("#source-key");
          const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
          let expected = "";

          while (walker.nextNode()) {
            const match = /recon-note:\s*ch01 build clue =\s*([a-z0-9-]+)/i.exec(walker.currentNode.nodeValue || "");

            if (match) {
              expected = match[1];
              break;
            }
          }

          root.querySelector('[data-action="verify-source"]').addEventListener("click", async () => {
            const value = input.value.trim();

            if (expected && value === expected) {
              await api.captureText("source", [
                "Build clue confirmed.",
                "You pulled an operational detail directly from shipped source."
              ]);
              return;
            }

            api.messageText("source", "error", [
              "That clue is not correct.",
              "Open page source and search for recon-note."
            ]);
          });

          return null;
        }
      },
      {
        id: 2,
        slug: "cookie-monster",
        title: "02 - Cookie Monster",
        difficulty: "easy",
        points: 100,
        summary: "The app trusts a role cookie without verifying it.",
        lesson: {
          summary: "Client-side cookies are user-controlled input. Trusting a role or permission value from the browser is broken access control.",
          exploit: "The attacker edits the role cookie from guest to admin, then asks the app to trust the tampered value.",
          defense: "Store authorization state server-side or sign it properly. Treat every cookie like untrusted input unless you verify integrity."
        },
        render(view) {
          return `
            <div class="lab-stack">
              ${solvedBanner(view)}
              <p class="lab-copy">This lab stores authorization in a cookie named <code>hl_role</code>. Change it from <code>guest</code> to <code>admin</code>, then ask the app to check your role.</p>
              <div class="lab-callout">Use DevTools Application tab or the console: <code>document.cookie = "hl_role=admin; path=/"</code>.</div>
              <div class="code-block" data-output="cookie-view">Loading cookies...</div>
              <div class="inline-actions">
                <button class="action-btn secondary" type="button" data-action="refresh-cookie">Refresh cookies</button>
                <button class="action-btn primary" type="button" data-action="check-cookie">Check role</button>
              </div>
              <div class="panel-output" data-output="cookie-result">Role check has not run yet.</div>
            </div>
          `;
        },
        mount(root, api) {
          const refreshCookieView = () => {
            api.messageText("cookie-view", "info", [document.cookie || "(no cookies set)"]);
          };

          if (!document.cookie.includes("hl_role=")) {
            document.cookie = "hl_role=guest; path=/";
          }

          refreshCookieView();

          root.querySelector('[data-action="refresh-cookie"]').addEventListener("click", refreshCookieView);
          root.querySelector('[data-action="check-cookie"]').addEventListener("click", async () => {
            const match = document.cookie.match(/(?:^|;\s*)hl_role=([^;]+)/);
            const role = match ? match[1] : "guest";

            if (role === "admin") {
              await api.captureText("cookie-result", [
                "Role accepted as admin.",
                "A user-controlled cookie just granted privileged access."
              ]);
              refreshCookieView();
              return;
            }

            api.messageText("cookie-result", "error", [
              `Current role is ${role}.`,
              "Change hl_role to admin and try again."
            ]);
            refreshCookieView();
          });

          return null;
        }
      },
      {
        id: 3,
        slug: "locked-door",
        title: "03 - Locked Door",
        difficulty: "easy",
        points: 100,
        summary: "A leaked backup config reveals an admin password in reversible encoding.",
        lesson: {
          summary: "Encoding is not security. Base64 hides text from casual readers, but it does not protect credentials or secrets.",
          exploit: "The attacker opens a leaked backup file, decodes the base64 password, and signs into the admin console.",
          defense: "Never ship secrets to the client, even encoded. Store credentials securely and remove backup artifacts from public access."
        },
        render(view) {
          const encodedPassword = btoa(secrets.adminPassword);

          return `
            <div class="lab-stack">
              ${solvedBanner(view)}
              <p class="lab-copy">An admin backup file leaked into the deployment package. It does not store the password in plain text, but the encoding is reversible.</p>
              <div class="inline-actions">
                <button class="action-btn secondary" type="button" data-action="toggle-config">Inspect backup-config.bak</button>
              </div>
              <div class="code-block" data-block="config" hidden>service=admin-panel
admin_user=admin
admin_pass_b64=${escapeHtml(encodedPassword)}
note=remove before shipping</div>
              <div>
                <label class="field-label" for="admin-user">Username</label>
                <input class="field" id="admin-user" type="text" autocomplete="off" placeholder="admin">
              </div>
              <div>
                <label class="field-label" for="admin-pass">Password</label>
                <input class="field" id="admin-pass" type="password" autocomplete="off" placeholder="decoded password">
              </div>
              <button class="action-btn primary" type="button" data-action="admin-login">Login to admin console</button>
              <div class="panel-output" data-output="admin-result">Credentials have not been tested.</div>
            </div>
          `;
        },
        mount(root, api) {
          const configBlock = root.querySelector('[data-block="config"]');
          const userInput = root.querySelector("#admin-user");
          const passInput = root.querySelector("#admin-pass");

          root.querySelector('[data-action="toggle-config"]').addEventListener("click", () => {
            configBlock.hidden = !configBlock.hidden;
          });

          root.querySelector('[data-action="admin-login"]').addEventListener("click", async () => {
            const username = userInput.value.trim();
            const password = passInput.value.trim();

            if (username === "admin" && password === secrets.adminPassword) {
              await api.captureText("admin-result", [
                "Admin console unlocked.",
                "The leaked backup file gave away valid credentials."
              ]);
              return;
            }

            api.messageText("admin-result", "error", [
              "Access denied.",
              "Decode the password from the leaked backup file and try again."
            ]);
          });

          return null;
        }
      },
      {
        id: 4,
        slug: "hidden-in-plain-sight",
        title: "04 - Hidden in Plain Sight",
        difficulty: "easy",
        points: 100,
        summary: "A debug token is leaking in a custom response header.",
        lesson: {
          summary: "Headers often reveal software versions, internal routing, and debugging metadata that attackers can chain into larger findings.",
          exploit: "The attacker inspects a simulated response, spots a suspicious custom header, and extracts the leaked token from it.",
          defense: "Keep response headers minimal in production, remove debug metadata, and review headers alongside body content during testing."
        },
        render(view) {
          return `
            <div class="lab-stack">
              ${solvedBanner(view)}
              <p class="lab-copy">This static lab simulates the response headers you would normally inspect in the Network tab. One endpoint leaks a token in a custom header.</p>
              <div class="inline-actions">
                <button class="action-btn secondary" type="button" data-action="request-health">GET /health</button>
                <button class="action-btn secondary" type="button" data-action="request-telemetry">GET /telemetry</button>
              </div>
              <div class="panel-output info" data-output="headers-view">No response inspected yet.</div>
              <div>
                <label class="field-label" for="header-token">Leaked debug token</label>
                <div class="inline-form">
                  <input class="field" id="header-token" type="text" autocomplete="off" placeholder="trace-...">
                  <button class="action-btn primary" type="button" data-action="verify-header-token">Verify token</button>
                </div>
              </div>
              <div class="panel-output" data-output="headers-result">Waiting for a token.</div>
            </div>
          `;
        },
        mount(root, api) {
          root.querySelector('[data-action="request-health"]').addEventListener("click", () => {
            api.messageHtml("headers-view", "info", renderResponse(
              "HTTP/1.1 200 OK\nContent-Type: application/json\nCache-Control: no-store\nX-Service: health-check",
              '{"status":"ok"}'
            ));
          });

          root.querySelector('[data-action="request-telemetry"]').addEventListener("click", () => {
            api.messageHtml("headers-view", "info", renderResponse(
              `HTTP/1.1 200 OK\nContent-Type: application/json\nX-Trace-Token: ${secrets.headerToken}\nX-Debug-Mode: partial\nCache-Control: no-store`,
              '{"queue":"telemetry","lag_ms":42}'
            ));
          });

          root.querySelector('[data-action="verify-header-token"]').addEventListener("click", async () => {
            const value = root.querySelector("#header-token").value.trim();

            if (value === secrets.headerToken) {
              await api.captureText("headers-result", [
                "Header token confirmed.",
                "Sensitive debug metadata leaked through a response header."
              ]);
              return;
            }

            api.messageText("headers-result", "error", [
              "That token does not match the leaked header value.",
              "Inspect the simulated telemetry response again."
            ]);
          });

          return null;
        }
      },
      {
        id: 5,
        slug: "robots-txt",
        title: "05 - robots.txt",
        difficulty: "easy",
        points: 100,
        summary: "robots.txt exposes a hidden path that should never have been public.",
        lesson: {
          summary: "robots.txt is a crawler hint, not an access control mechanism. Attackers read it because it advertises what someone wanted to hide.",
          exploit: "The attacker fetches robots.txt, spots a disallowed archive route, and browses directly to the exposed path.",
          defense: "Never rely on robots.txt for secrecy. Protect sensitive routes with real authorization and avoid publishing internal paths at all."
        },
        render(view) {
          return `
            <div class="lab-stack">
              ${solvedBanner(view)}
              <p class="lab-copy">Fetch the simulated <code>/robots.txt</code>, find the disallowed archive path, and then request it directly.</p>
              <div class="inline-actions">
                <button class="action-btn secondary" type="button" data-action="fetch-robots">Fetch /robots.txt</button>
              </div>
              <div class="code-block" data-output="robots-file">robots.txt has not been fetched yet.</div>
              <div>
                <label class="field-label" for="robots-path">Hidden path from robots.txt</label>
                <div class="inline-form">
                  <input class="field" id="robots-path" type="text" autocomplete="off" placeholder="/archive-xxxxx/">
                  <button class="action-btn primary" type="button" data-action="fetch-hidden-path">Request hidden path</button>
                </div>
              </div>
              <div class="panel-output" data-output="robots-result">Waiting for a path.</div>
            </div>
          `;
        },
        mount(root, api) {
          root.querySelector('[data-action="fetch-robots"]').addEventListener("click", () => {
            api.messageText("robots-file", "info", [
              "User-agent: *",
              "Disallow: /admin/",
              `Disallow: ${secrets.robotsPath}`,
              "Disallow: /internal-api/"
            ]);
          });

          root.querySelector('[data-action="fetch-hidden-path"]').addEventListener("click", async () => {
            const value = root.querySelector("#robots-path").value.trim();

            if (value === secrets.robotsPath) {
              await api.captureText("robots-result", [
                `200 OK ${secrets.robotsPath}`,
                "archive note: backup index is still public."
              ]);
              return;
            }

            api.messageText("robots-result", "error", [
              `404 for ${value || "(empty path)"}.`,
              "Use the exact hidden path from robots.txt."
            ]);
          });

          return null;
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
          summary: "Default credentials remain one of the fastest ways into exposed admin panels, especially on appliances and internal tools.",
          exploit: "The attacker tries a few common factory username and password pairs until the monitoring panel grants access.",
          defense: "Force credential rotation on first boot, disable defaults before exposure, and inventory old systems that were never reconfigured."
        },
        render(view) {
          return `
            <div class="lab-stack">
              ${solvedBanner(view)}
              <p class="lab-copy">The monitoring appliance was never reconfigured after install. Try common factory pairs until the dashboard opens.</p>
              <div class="lab-callout">Likely guesses: <code>admin/admin</code>, <code>admin/password</code>, <code>monitor/monitor</code>, <code>backup/backup</code>.</div>
              <div>
                <label class="field-label" for="default-user">Username</label>
                <input class="field" id="default-user" type="text" autocomplete="off" placeholder="username">
              </div>
              <div>
                <label class="field-label" for="default-pass">Password</label>
                <input class="field" id="default-pass" type="password" autocomplete="off" placeholder="password">
              </div>
              <button class="action-btn primary" type="button" data-action="default-login">Login to dashboard</button>
              <div class="panel-output" data-output="default-result">No login attempt yet.</div>
            </div>
          `;
        },
        mount(root, api) {
          root.querySelector('[data-action="default-login"]').addEventListener("click", async () => {
            const username = root.querySelector("#default-user").value.trim();
            const password = root.querySelector("#default-pass").value.trim();
            const matched = defaultPairs.some(([user, pass]) => user === username && pass === password);

            if (matched) {
              await api.captureText("default-result", [
                `Dashboard opened with ${username}/${password}.`,
                "Factory defaults should never survive deployment."
              ]);
              return;
            }

            api.messageText("default-result", "error", [
              "Invalid credentials.",
              "Keep trying the usual factory pairs."
            ]);
          });

          return null;
        }
      },
      {
        id: 7,
        slug: "reflected-xss",
        title: "07 - Reflected XSS",
        difficulty: "medium",
        points: 200,
        summary: "Unsanitized search results reflect HTML directly into the page.",
        lesson: {
          summary: "Reflected XSS happens when untrusted input is inserted into HTML without escaping, letting attacker-controlled script run immediately.",
          exploit: "The attacker sends a payload that executes in the reflected result block and dispatches a browser event when it fires.",
          defense: "Escape untrusted content, use textContent instead of innerHTML where possible, and backstop the app with a strong Content Security Policy."
        },
        render(view) {
          return `
            <div class="lab-stack">
              ${solvedBanner(view)}
              <p class="lab-copy">The search term is rendered with <code>innerHTML</code>. Make your payload execute JavaScript and dispatch <code>window.dispatchEvent(new Event("hacklab:xss:reflected"))</code>.</p>
              <div class="inline-form">
                <input class="field" id="xss-input" type="text" autocomplete="off" placeholder='Try an img onerror payload'>
                <button class="action-btn primary" type="button" data-action="run-reflected-xss">Render result</button>
              </div>
              <div class="lab-note">Reflected result:</div>
              <div class="code-block" id="xss-reflection">Nothing rendered yet.</div>
              <div class="panel-output" data-output="xss-result">Payload has not executed.</div>
            </div>
          `;
        },
        mount(root, api) {
          const reflection = root.querySelector("#xss-reflection");

          root.querySelector('[data-action="run-reflected-xss"]').addEventListener("click", () => {
            reflection.innerHTML = root.querySelector("#xss-input").value;
            api.messageText("xss-result", "warning", ["Rendered search results. If your payload fires, the exploit will complete automatically."]);
          });

          return api.listenWindow("hacklab:xss:reflected", async () => {
            await api.captureText("xss-result", [
              "Payload executed inside the reflected result.",
              "Unescaped HTML gave you script execution."
            ]);
          });
        }
      },
      {
        id: 8,
        slug: "sqli-login",
        title: "08 - SQL Injection - Login",
        difficulty: "medium",
        points: 200,
        summary: "Bypass a login form that concatenates user input into a SQL query.",
        lesson: {
          summary: "String-built SQL lets attackers change query logic, bypass authentication, and sometimes take over the whole database.",
          exploit: "The attacker closes the username string, adds a tautology or a comment, and neutralizes the password check.",
          defense: "Use parameterized queries everywhere. If user input never changes query structure, injection attacks lose their leverage."
        },
        render(view) {
          return `
            <div class="lab-stack">
              ${solvedBanner(view)}
              <p class="lab-copy">This login builds a query by string concatenation. Break out of the username field and bypass the password check.</p>
              <div>
                <label class="field-label" for="sqli-user">Username</label>
                <input class="field" id="sqli-user" type="text" autocomplete="off" placeholder="username">
              </div>
              <div>
                <label class="field-label" for="sqli-pass">Password</label>
                <input class="field" id="sqli-pass" type="text" autocomplete="off" placeholder="password">
              </div>
              <button class="action-btn primary" type="button" data-action="run-sqli-login">Login</button>
              <div class="code-block" data-output="sqli-login-query">SELECT * FROM users WHERE username='' AND password=''</div>
              <div class="panel-output" data-output="sqli-login-result">Waiting for a login attempt.</div>
            </div>
          `;
        },
        mount(root, api) {
          root.querySelector('[data-action="run-sqli-login"]').addEventListener("click", async () => {
            const username = root.querySelector("#sqli-user").value;
            const password = root.querySelector("#sqli-pass").value;
            const query = `SELECT * FROM users WHERE username='${username}' AND password='${password}'`;
            const lower = username.toLowerCase();

            api.messageText("sqli-login-query", "info", [query]);

            const bypass =
              /'\s*or\s*'?1'?='?1/i.test(lower) ||
              /'\s*or\s*'[^']*'='[^']*/i.test(lower) ||
              /--/.test(username) ||
              /#/.test(username) ||
              /admin'\s*$/i.test(lower);

            if (bypass) {
              await api.captureText("sqli-login-result", [
                "Authentication bypassed.",
                "The injected username changed the SQL logic before the password check."
              ]);
              return;
            }

            if (username === "analyst" && password === "letmein") {
              api.messageText("sqli-login-result", "info", [
                "Valid user login, but not an exploit.",
                "You need to alter the query itself."
              ]);
              return;
            }

            api.messageText("sqli-login-result", "error", [
              "Login failed.",
              "Try a classic SQLi payload in the username field."
            ]);
          });

          return null;
        }
      },
      {
        id: 9,
        slug: "sqli-union",
        title: "09 - SQL Injection - Extract",
        difficulty: "medium",
        points: 250,
        summary: "Use UNION injection to read rows from another table.",
        lesson: {
          summary: "UNION-based SQLi turns one query into many by appending attacker-controlled result sets to the original response.",
          exploit: "The attacker closes the LIKE clause, unions in a second SELECT, and reads internal rows from the secrets table.",
          defense: "Parameterized queries stop structural injection, and least-privilege database accounts reduce blast radius when something slips through."
        },
        render(view) {
          return `
            <div class="lab-stack">
              ${solvedBanner(view)}
              <p class="lab-copy">The product search runs <code>SELECT name, price FROM products WHERE name LIKE '%INPUT%'</code>. Use a two-column UNION to pull data from <code>secrets</code>.</p>
              <div class="inline-form">
                <input class="field" id="union-input" type="text" autocomplete="off" placeholder="' UNION SELECT note, 1 FROM secrets--">
                <button class="action-btn primary" type="button" data-action="run-union">Search</button>
              </div>
              <div class="code-block" data-output="union-query">SELECT name, price FROM products WHERE name LIKE '%%'</div>
              <div class="panel-output" data-output="union-result">No query executed yet.</div>
            </div>
          `;
        },
        mount(root, api) {
          root.querySelector('[data-action="run-union"]').addEventListener("click", async () => {
            const raw = root.querySelector("#union-input").value;
            const query = `SELECT name, price FROM products WHERE name LIKE '%${raw}%'`;
            const unionMatch = /'\s*union\s+select\s+(.+?)\s+from\s+(\w+)\s*(?:--|#)?/i.exec(raw);

            api.messageText("union-query", "info", [query]);

            if (unionMatch) {
              const columns = unionMatch[1].split(",").map((column) => column.trim()).filter(Boolean);
              const table = unionMatch[2].toLowerCase();

              if (columns.length !== 2) {
                api.messageText("union-result", "error", [
                  "SQL error: column count mismatch.",
                  "The original query returns exactly two columns."
                ]);
                return;
              }

              if (table === "secrets") {
                const rows = secretsTable
                  .map((row) => `<tr><td>${escapeHtml(row.note)}</td><td>${escapeHtml(row.level)}</td></tr>`)
                  .join("");

                await api.captureHtml("union-result", `
                  <p>UNION query succeeded and exposed rows from the secrets table.</p>
                  <div class="table-wrap">
                    <table>
                      <thead>
                        <tr><th>note</th><th>level</th></tr>
                      </thead>
                      <tbody>${rows}</tbody>
                    </table>
                  </div>
                `);
                return;
              }

              api.messageText("union-result", "error", [
                `Table ${table} is not readable in this lab.`,
                "Aim for the secrets table."
              ]);
              return;
            }

            if (raw.includes("'")) {
              api.messageText("union-result", "error", [
                "SQL syntax error near your quote.",
                "Close the string and use UNION SELECT."
              ]);
              return;
            }

            const hits = products.filter((product) => product.name.toLowerCase().includes(raw.toLowerCase()));

            if (!hits.length) {
              api.messageText("union-result", "warning", ["No products matched that search."]);
              return;
            }

            const rows = hits
              .map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.price)}</td></tr>`)
              .join("");

            api.messageHtml("union-result", "info", `
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr><th>name</th><th>price</th></tr>
                  </thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
            `);
          });

          return null;
        }
      },
      {
        id: 10,
        slug: "jwt-tamper",
        title: "10 - Trust Issues (JWT)",
        difficulty: "medium",
        points: 250,
        summary: "Modify a token payload because the app never verifies the signature.",
        lesson: {
          summary: "JWTs are only trustworthy when their signature is verified. A base64-decoded payload by itself proves nothing.",
          exploit: "The attacker edits the token payload, changes the role to admin, and reuses the original signature because the app never checks it.",
          defense: "Always verify the signature, validate the algorithm and claims, and reject unsigned or tampered tokens before using the payload."
        },
        render(view) {
          const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
          const payload = btoa(JSON.stringify({ user: "guest", role: "user", exp: 2099999999 }));
          const token = `${header}.${payload}.${secrets.jwtSignature}`;

          return `
            <div class="lab-stack">
              ${solvedBanner(view)}
              <p class="lab-copy">The app trusts the payload of this token but never verifies the signature. Change the role to <code>admin</code> and submit the modified token.</p>
              <div class="code-block">${escapeHtml(token)}</div>
              <div>
                <label class="field-label" for="jwt-input">Modified token</label>
                <input class="field" id="jwt-input" type="text" autocomplete="off" placeholder="header.payload.signature">
              </div>
              <button class="action-btn primary" type="button" data-action="verify-jwt">Verify token</button>
              <div class="panel-output" data-output="jwt-result">No token verified yet.</div>
            </div>
          `;
        },
        mount(root, api) {
          root.querySelector('[data-action="verify-jwt"]').addEventListener("click", async () => {
            const token = root.querySelector("#jwt-input").value.trim();
            const parts = token.split(".");

            if (parts.length !== 3) {
              api.messageText("jwt-result", "error", [
                "Expected header.payload.signature.",
                "JWTs always have exactly three parts."
              ]);
              return;
            }

            try {
              const payload = JSON.parse(atob(parts[1]));

              if (payload.role === "admin") {
                await api.captureText("jwt-result", [
                  "Admin role accepted from the token payload.",
                  "The app never verified the signature before trusting it."
                ]);
                return;
              }

              api.messageText("jwt-result", "error", [
                `Role is ${payload.role || "(missing)"}.`,
                "Change it to admin and keep the token structure valid."
              ]);
            } catch (error) {
              api.messageText("jwt-result", "error", [
                "Could not decode the token payload.",
                "Edit the middle section as valid base64 JSON."
              ]);
            }
          });

          return null;
        }
      },
      {
        id: 11,
        slug: "idor",
        title: "11 - IDOR",
        difficulty: "medium",
        points: 200,
        summary: "Browse another user's record by changing a numeric identifier.",
        lesson: {
          summary: "IDOR issues happen when an application exposes object identifiers but never checks whether the current user should access them.",
          exploit: "The attacker changes the profile ID from their own record to an admin record and receives sensitive data without authorization.",
          defense: "Enforce authorization on every object access, use indirect identifiers where practical, and test for horizontal and vertical privilege abuse."
        },
        render(view) {
          return `
            <div class="lab-stack">
              ${solvedBanner(view)}
              <p class="lab-copy">Your own profile lives at <code>/profile?id=1001</code>. Another profile contains a sensitive vault ticket. Change the ID and fetch it.</p>
              <div class="inline-form">
                <input class="field" id="idor-input" type="text" autocomplete="off" value="1001" placeholder="1001">
                <button class="action-btn primary" type="button" data-action="fetch-profile">Fetch profile</button>
              </div>
              <div class="panel-output" data-output="idor-result">No profile requested yet.</div>
            </div>
          `;
        },
        mount(root, api) {
          root.querySelector('[data-action="fetch-profile"]').addEventListener("click", async () => {
            const id = Number.parseInt(root.querySelector("#idor-input").value, 10);
            const profile = profiles.find((item) => item.id === id);

            if (!profile) {
              api.messageText("idor-result", "error", [
                `404: no profile for id=${Number.isNaN(id) ? "invalid" : id}.`
              ]);
              return;
            }

            if (profile.username === "admin") {
              await api.captureText("idor-result", [
                `200 OK /profile?id=${profile.id}`,
                `${profile.username} | ${profile.email} | ${profile.bio}`
              ]);
              return;
            }

            api.messageText("idor-result", "info", [
              `200 OK /profile?id=${profile.id}`,
              `${profile.username} | ${profile.email} | ${profile.bio}`
            ]);
          });

          return null;
        }
      },
      {
        id: 12,
        slug: "stored-xss",
        title: "12 - Stored XSS",
        difficulty: "medium",
        points: 250,
        summary: "Persist a malicious payload that executes whenever comments render.",
        lesson: {
          summary: "Stored XSS is more dangerous than reflected XSS because the malicious payload survives and hits every viewer until the data is cleaned up.",
          exploit: "The attacker posts HTML into a comment field, the app stores it, and the next render executes the payload from the database-backed content.",
          defense: "Escape stored content on output, sanitize rich text safely, and treat stored user input as hostile forever, not just on submission."
        },
        render(view) {
          return `
            <div class="lab-stack">
              ${solvedBanner(view)}
              <p class="lab-copy">Comments are re-rendered with <code>innerHTML</code>. Post a payload that dispatches <code>window.dispatchEvent(new Event("hacklab:xss:stored"))</code> when anyone loads the thread.</p>
              <div>
                <label class="field-label" for="comment-author">Author</label>
                <input class="field" id="comment-author" type="text" autocomplete="off" placeholder="anonymous">
              </div>
              <div>
                <label class="field-label" for="comment-text">Comment</label>
                <textarea class="textarea" id="comment-text" placeholder='Try an img onerror payload'></textarea>
              </div>
              <button class="action-btn primary" type="button" data-action="post-comment">Post comment</button>
              <div class="panel-output" data-output="stored-result">No payload fired yet.</div>
              <div id="comment-list-root"></div>
            </div>
          `;
        },
        mount(root, api) {
          const listRoot = root.querySelector("#comment-list-root");

          renderComments(listRoot);

          root.querySelector('[data-action="post-comment"]').addEventListener("click", () => {
            const author = root.querySelector("#comment-author").value.trim() || "anonymous";
            const text = root.querySelector("#comment-text").value;

            if (!text.trim()) {
              api.messageText("stored-result", "warning", ["Add a comment payload before posting."]);
              return;
            }

            comments.push({ author, text });
            root.querySelector("#comment-text").value = "";
            renderComments(listRoot);
            api.messageText("stored-result", "warning", [
              "Comment stored and rendered.",
              "If your payload is valid, the exploit will complete automatically."
            ]);
          });

          return api.listenWindow("hacklab:xss:stored", async () => {
            await api.captureText("stored-result", [
              "Stored payload executed when the comment thread rendered.",
              "This is persistent script execution from stored content."
            ]);
          });
        }
      },
      {
        id: 13,
        slug: "path-traversal",
        title: "13 - Path Traversal",
        difficulty: "hard",
        points: 350,
        summary: "Bypass a sanitizer that strips ../ only once.",
        lesson: {
          summary: "Path traversal flaws happen when user input is joined into file paths without strict normalization and allowlisting.",
          exploit: "The attacker disguises traversal with a payload that still becomes <code>../</code> after a single replace, then escapes the public directory.",
          defense: "Resolve paths safely, reject traversal after normalization, and only serve files from a known allowlist instead of trusting user-supplied paths."
        },
        render(view) {
          return `
            <div class="lab-stack">
              ${solvedBanner(view)}
              <p class="lab-copy">The file viewer removes the first <code>../</code> it sees and then resolves the path. Escape the <code>public</code> directory and read the private secret file.</p>
              <div class="lab-callout">Try disguising traversal with <code>....//</code> so a single replace still leaves <code>../</code> behind.</div>
              <div class="inline-form">
                <input class="field" id="path-input" type="text" autocomplete="off" placeholder="docs/faq.txt">
                <button class="action-btn primary" type="button" data-action="read-file">Read file</button>
              </div>
              <div class="code-block" data-output="path-debug">public/ + input -> waiting...</div>
              <div class="panel-output" data-output="path-result">No file requested yet.</div>
            </div>
          `;
        },
        mount(root, api) {
          root.querySelector('[data-action="read-file"]').addEventListener("click", async () => {
            const raw = root.querySelector("#path-input").value.trim();
            const sanitized = sanitizeOnce(raw);
            const resolved = normalizePath(`public/${sanitized}`);

            api.messageText("path-debug", "info", [
              `raw input: ${raw || "(empty)"}`,
              `after single replace: ${sanitized || "(empty)"}`,
              `resolved path: ${resolved || "(empty)"}`
            ]);

            if (fileStore[resolved]) {
              if (resolved === "private/secret.txt") {
                await api.captureText("path-result", [
                  `200 OK ${resolved}`,
                  fileStore[resolved]
                ]);
                return;
              }

              api.messageText("path-result", "info", [
                `200 OK ${resolved}`,
                fileStore[resolved]
              ]);
              return;
            }

            if (raw.includes("../")) {
              api.messageText("path-result", "error", [
                "403: literal ../ detected before normalization.",
                "Disguise the traversal so a single replace still leaves it behind."
              ]);
              return;
            }

            api.messageText("path-result", "error", [`404: ${resolved || "(empty path)"} not found.`]);
          });

          return null;
        }
      },
      {
        id: 14,
        slug: "blind-sqli",
        title: "14 - SQL Injection - Blind",
        difficulty: "hard",
        points: 400,
        summary: "Use true or false responses to recover the admin password one character at a time.",
        lesson: {
          summary: "Blind SQLi is still dangerous even when the app hides query results. Boolean differences alone can leak secrets bit by bit.",
          exploit: "The attacker probes the password with substring checks, learns which guesses return true, then reconstructs the whole secret.",
          defense: "Parameterized queries prevent the injection itself, and consistent error handling keeps attackers from learning anything from response differences."
        },
        render(view) {
          return `
            <div class="lab-stack">
              ${solvedBanner(view)}
              <p class="lab-copy">The username field is injectable, but the endpoint only returns a boolean result. Probe the admin password one character at a time, then submit the recovered password.</p>
              <div class="lab-callout">Example probe: <code>admin' AND SUBSTR(password,1,1)='a'--</code></div>
              <div class="inline-form">
                <input class="field" id="blind-probe" type="text" autocomplete="off" placeholder="admin">
                <button class="action-btn primary" type="button" data-action="run-blind-probe">Run probe</button>
              </div>
              <div class="code-block" data-output="blind-query">SELECT id FROM users WHERE username='admin'</div>
              <div class="panel-output" data-output="blind-result">No probe sent yet.</div>
              <div>
                <label class="field-label" for="blind-password">Recovered admin password</label>
                <div class="inline-form">
                  <input class="field" id="blind-password" type="text" autocomplete="off" placeholder="8-character password">
                  <button class="action-btn primary" type="button" data-action="submit-blind-password">Submit password</button>
                </div>
              </div>
              <div class="panel-output" data-output="blind-final">Password not submitted yet.</div>
            </div>
          `;
        },
        mount(root, api) {
          root.querySelector('[data-action="run-blind-probe"]').addEventListener("click", () => {
            const raw = root.querySelector("#blind-probe").value;
            const probePattern = /^([a-z0-9_]+)'\s+AND\s+(?:SUBSTR|SUBSTRING)\(password,\s*(\d+),\s*1\)\s*=\s*'(.{1})'\s*(?:--|#)$/i;
            const match = probePattern.exec(raw);

            api.messageText("blind-query", "info", [`SELECT id FROM users WHERE username='${raw}'`]);

            if (match) {
              const username = match[1];
              const index = Number.parseInt(match[2], 10) - 1;
              const guess = match[3];
              const correct = username === "admin" && secrets.blindPassword[index] === guess;

              if (correct) {
                api.messageText("blind-result", "success", [
                  "HTTP 200: condition evaluated TRUE.",
                  `Character ${index + 1} matches ${guess}.`
                ]);
                return;
              }

              api.messageText("blind-result", "error", [
                "HTTP 404: condition evaluated FALSE.",
                "That guess was wrong."
              ]);
              return;
            }

            if (raw.includes("'")) {
              api.messageText("blind-result", "error", [
                "HTTP 500: malformed SQL syntax.",
                "Use a boolean probe shaped like the example."
              ]);
              return;
            }

            if (raw === "admin") {
              api.messageText("blind-result", "info", [
                "HTTP 200: username exists.",
                "Now convert that into boolean probes on the password."
              ]);
              return;
            }

            api.messageText("blind-result", "warning", ["HTTP 404: user not found."]);
          });

          root.querySelector('[data-action="submit-blind-password"]').addEventListener("click", async () => {
            const guess = root.querySelector("#blind-password").value.trim();

            if (guess === secrets.blindPassword) {
              await api.captureText("blind-final", [
                "Recovered admin password confirmed.",
                `admin password = ${guess}`
              ]);
              return;
            }

            api.messageText("blind-final", "error", [
              "That password is not correct.",
              "Keep probing the boolean endpoint."
            ]);
          });

          return null;
        }
      },
      {
        id: 15,
        slug: "broken-access-control",
        title: "15 - Broken Access Control",
        difficulty: "hard",
        points: 400,
        summary: "The API trusts a role header set by the client.",
        lesson: {
          summary: "Frontend controls are cosmetic. If the backend trusts user-supplied role headers, attackers can promote themselves instantly.",
          exploit: "The attacker edits the role header from user to admin and the API responds with protected data because no server-side authorization exists.",
          defense: "Make the backend derive identity and permissions from trusted session data, not from request headers the caller can set freely."
        },
        render(view) {
          return `
            <div class="lab-stack">
              ${solvedBanner(view)}
              <p class="lab-copy">The frontend normally sends <code>X-User-Role: user</code>, but the API trusts whatever the client provides. Modify the header and fetch the protected secret.</p>
              <div>
                <label class="field-label" for="role-header">X-User-Role</label>
                <div class="inline-form">
                  <input class="field" id="role-header" type="text" autocomplete="off" value="user" placeholder="user">
                  <button class="action-btn primary" type="button" data-action="fetch-api-secret">GET /api/secret</button>
                </div>
              </div>
              <div class="code-block" data-output="api-preview">GET /api/secret
X-User-Role: user</div>
              <div class="panel-output" data-output="api-result">No request sent yet.</div>
            </div>
          `;
        },
        mount(root, api) {
          root.querySelector('[data-action="fetch-api-secret"]').addEventListener("click", async () => {
            const role = root.querySelector("#role-header").value.trim() || "user";

            api.messageText("api-preview", "info", [
              "GET /api/secret",
              `X-User-Role: ${role}`
            ]);

            if (role === "admin") {
              await api.captureText("api-result", [
                "200 OK",
                `{"secret":"${secrets.apiSecret}","debug":"role header was trusted"}`
              ]);
              return;
            }

            api.messageText("api-result", "error", [
              "403 Forbidden",
              `Role ${role} is not authorized.`
            ]);
          });

          return null;
        }
      }
    ];

    return challenges;
  };
})();
