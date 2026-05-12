(() => {
  window.createHackLabChallengeViews = function createHackLabChallengeViews(runtime) {
    const { escapeHtml } = runtime;

    function solvedBanner(challenge) {
      if (!challenge.solved || !challenge.flag) {
        return "";
      }

      return `
        <div class="status-banner success">
          <strong>Already cleared.</strong>
          <span>Captured flag: <code>${escapeHtml(challenge.flag)}</code></span>
        </div>
      `;
    }

    function artifactList(items) {
      return `
        <ul class="artifact-list">
          ${items.map((item) => `<li>${item}</li>`).join("")}
        </ul>
      `;
    }

    function rawLink(path, label = path) {
      return `<a class="raw-link" href="${path}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
    }

    function backendLink(api, path, label = path, withSession = true) {
      return rawLink(api.apiUrl(path, { session: withSession }), label);
    }

    async function applyJsonResult(api, target, result, extraHtml = "") {
      if (!result.json) {
        api.renderHttp(target, result, { extraHtml });
        return;
      }

      const data = result.json;
      const tone = data.ok ? (data.solved ? "success" : "info") : "error";
      let html = api.paragraphs(data.message || [`HTTP ${result.status} ${result.statusText}`]);

      if (extraHtml) {
        html += extraHtml;
      }

      if (data.flag) {
        html += api.flagBox(data.flag);
        await api.sync();
      }

      api.messageHtml(target, tone, html);
    }

    async function syncSolveFromState(api, target, result, challengeId, successLines = []) {
      await api.sync();
      const updated = api.getChallenge(challengeId);
      const solved = updated && updated.solved;
      const extraHtml = solved
        ? `${api.paragraphs(successLines)}${api.flagBox(updated.flag)}`
        : "";

      api.renderHttp(target, result, {
        tone: solved ? "success" : undefined,
        extraHtml
      });
    }

    function renderCookieLab(challenge, api) {
      if (api.isSameOriginApi) {
        return `
          <div class="lab-stack">
            ${solvedBanner(challenge)}
            <p class="lab-copy">The backend trusts a role cookie. Change it, then request the live endpoint and see what the server accepts.</p>
            ${artifactList([
              `Endpoint: ${backendLink(api, "/api/whoami", "GET /api/whoami", false)}`,
              "Cookie name: hl_role",
              "Goal: convince the backend to trust a stronger role than it should"
            ])}
            <div class="inline-actions">
              <button class="action-btn secondary" type="button" data-action="refresh-cookies">Refresh cookies</button>
              <button class="action-btn primary" type="button" data-action="request-whoami">Request /api/whoami</button>
            </div>
            <div class="panel-output info" data-output="cookie-view">No cookie snapshot yet.</div>
            <div class="panel-output" data-output="cookie-result">No server request yet.</div>
          </div>
        `;
      }

      const cookieLabUrl = api.apiUrl("/labs/cookie-jar", { session: true });

      return `
        <div class="lab-stack">
          ${solvedBanner(challenge)}
          <p class="lab-copy">This lab runs on the backend origin because the vulnerability depends on a real role cookie. Tamper with the worker-scoped cookie there, then sync the result back here.</p>
          ${artifactList([
            `Target: ${backendLink(api, "/labs/cookie-jar", "Open cookie lab in a new tab")}`,
            "Goal: upgrade the trusted role cookie and get the backend to accept it",
            "If your browser blocks third-party cookies in the embedded frame, use the new-tab target instead."
          ])}
          <div class="inline-actions">
            <button class="action-btn secondary" type="button" data-action="reload-cookie-frame">Reload lab frame</button>
            <button class="action-btn primary" type="button" data-action="sync-cookie-lab">Sync progress</button>
          </div>
          <div class="iframe-shell">
            <iframe class="lab-frame" id="cookie-frame" src="${cookieLabUrl}" title="Cookie tampering lab"></iframe>
          </div>
          <div class="panel-output" data-output="cookie-result">Waiting for the worker lab to report that the tampered cookie was trusted.</div>
        </div>
      `;
    }

    function mountCookieLab(root, api) {
      if (api.isSameOriginApi) {
        const refreshCookies = () => {
          api.messageHtml("cookie-view", "info", api.codeBlock(document.cookie || "(no cookies set)"));
        };

        refreshCookies();

        root.querySelector('[data-action="refresh-cookies"]').addEventListener("click", refreshCookies);
        root.querySelector('[data-action="request-whoami"]').addEventListener("click", async () => {
          const result = await api.request({ path: "/api/whoami" });
          await applyJsonResult(api, "cookie-result", result);
          refreshCookies();
        });

        return null;
      }

      const frame = root.querySelector("#cookie-frame");
      const reloadFrame = () => {
        frame.src = api.apiUrl("/labs/cookie-jar", { session: true });
      };
      const listener = async (event) => {
        if (!event.data || event.data.type !== "hacklab-solved" || event.data.challengeId !== 2) {
          return;
        }

        await applyJsonResult(api, "cookie-result", {
          ok: true,
          status: 200,
          statusText: "OK",
          headers: [],
          text: "",
          json: event.data.data
        });
      };

      root.querySelector('[data-action="reload-cookie-frame"]').addEventListener("click", reloadFrame);
      root.querySelector('[data-action="sync-cookie-lab"]').addEventListener("click", async () => {
        await api.sync();
        const updated = api.getChallenge(2);

        if (updated && updated.solved) {
          api.messageHtml("cookie-result", "success", `${api.paragraphs("Cookie lab solved.")}${api.flagBox(updated.flag)}`);
          return;
        }

        api.messageText("cookie-result", "warning", [
          "No solve recorded yet.",
          "Open the worker lab, tamper with the role cookie there, then ask the backend to re-check it."
        ]);
      });

      return api.listenMessages(listener);
    }

    return {
      1: {
        render(challenge) {
          return `
            <div class="lab-stack">
              ${solvedBanner(challenge)}
              <p class="lab-copy">This lab still rewards source recon on purpose. Inspect the HTML for the page you loaded, search for <code>recon-note</code>, and submit the leaked build clue.</p>
              <div class="lab-callout">This is the one challenge where shipped source is the intended attack surface.</div>
              ${artifactList([
                "Artifact: the raw HTML for the page you are currently on",
                "Objective: recover the leaked build clue",
                "Tip: use your browser's page source view and search for recon-note"
              ])}
              <div>
                <label class="field-label" for="source-key">Leaked clue</label>
                <div class="inline-form">
                  <input class="field" id="source-key" type="text" autocomplete="off" placeholder="source-map-...">
                  <button class="action-btn primary" type="button" data-action="verify-source">Verify clue</button>
                </div>
              </div>
              <div class="panel-output" data-output="source-result">Waiting for a clue from the raw source.</div>
            </div>
          `;
        },
        mount(root, api) {
          root.querySelector('[data-action="verify-source"]').addEventListener("click", async () => {
            const clue = root.querySelector("#source-key").value.trim();
            const result = await api.request({
              path: "/api/challenges/1/verify",
              method: "POST",
              json: { clue }
            });
            await applyJsonResult(api, "source-result", result);
          });

          return null;
        }
      },
      2: {
        render(challenge, api) {
          return renderCookieLab(challenge, api);
        },
        mount(root, api) {
          return mountCookieLab(root, api);
        }
      },
      3: {
        render(challenge, api) {
          return `
            <div class="lab-stack">
              ${solvedBanner(challenge)}
              <p class="lab-copy">An exposed backup file contains live login material. Pull the artifact, decode what is hidden inside it, and use the real login endpoint.</p>
              ${artifactList([
                `Artifact: ${backendLink(api, "/backup-config.bak", "GET /backup-config.bak")}`,
                "Endpoint: POST /api/admin/login",
                "Goal: authenticate as admin"
              ])}
              <div class="inline-actions">
                <button class="action-btn secondary" type="button" data-action="fetch-backup">Fetch backup artifact</button>
              </div>
              <div class="panel-output" data-output="backup-result">Artifact not requested yet.</div>
              <div>
                <label class="field-label" for="admin-user">Username</label>
                <input class="field" id="admin-user" type="text" autocomplete="off" placeholder="admin">
              </div>
              <div>
                <label class="field-label" for="admin-pass">Password</label>
                <input class="field" id="admin-pass" type="password" autocomplete="off" placeholder="decoded password">
              </div>
              <button class="action-btn primary" type="button" data-action="admin-login">POST /api/admin/login</button>
              <div class="panel-output" data-output="admin-login-result">Login has not been attempted.</div>
            </div>
          `;
        },
        mount(root, api) {
          root.querySelector('[data-action="fetch-backup"]').addEventListener("click", async () => {
            const result = await api.request({ path: "/backup-config.bak" });
            api.renderHttp("backup-result", result);
          });

          root.querySelector('[data-action="admin-login"]').addEventListener("click", async () => {
            const username = root.querySelector("#admin-user").value.trim();
            const password = root.querySelector("#admin-pass").value.trim();
            const result = await api.request({
              path: "/api/admin/login",
              method: "POST",
              json: { username, password }
            });
            await applyJsonResult(api, "admin-login-result", result);
          });

          return null;
        }
      },
      4: {
        render(challenge, api) {
          return `
            <div class="lab-stack">
              ${solvedBanner(challenge)}
              <p class="lab-copy">A live endpoint leaks a token in a response header. Pull the response, inspect the headers, and submit the value separately.</p>
              ${artifactList([
                `Endpoint: ${backendLink(api, "/telemetry", "GET /telemetry")}`,
                "Goal: identify the leaked trace token from the response headers"
              ])}
              <div class="inline-actions">
                <button class="action-btn secondary" type="button" data-action="fetch-telemetry">Fetch /telemetry</button>
              </div>
              <div class="panel-output" data-output="telemetry-result">Response not requested yet.</div>
              <div>
                <label class="field-label" for="trace-token">Leaked token</label>
                <div class="inline-form">
                  <input class="field" id="trace-token" type="text" autocomplete="off" placeholder="trace-...">
                  <button class="action-btn primary" type="button" data-action="verify-telemetry">Verify token</button>
                </div>
              </div>
              <div class="panel-output" data-output="telemetry-verify">Waiting for a token.</div>
            </div>
          `;
        },
        mount(root, api) {
          root.querySelector('[data-action="fetch-telemetry"]').addEventListener("click", async () => {
            const result = await api.request({ path: "/telemetry" });
            api.renderHttp("telemetry-result", result);
          });

          root.querySelector('[data-action="verify-telemetry"]').addEventListener("click", async () => {
            const token = root.querySelector("#trace-token").value.trim();
            const result = await api.request({
              path: "/api/challenges/4/verify",
              method: "POST",
              json: { token }
            });
            await applyJsonResult(api, "telemetry-verify", result);
          });

          return null;
        }
      },
      5: {
        render(challenge, api) {
          return `
            <div class="lab-stack">
              ${solvedBanner(challenge)}
              <p class="lab-copy">robots.txt is public and the hidden route behind it is still reachable. Discover the path and request it like a real target.</p>
              ${artifactList([
                `Artifact: ${backendLink(api, "/robots.txt", "GET /robots.txt")}`,
                "Goal: reach the disallowed archive route"
              ])}
              <div class="inline-actions">
                <button class="action-btn secondary" type="button" data-action="fetch-robots">Fetch /robots.txt</button>
              </div>
              <div class="panel-output" data-output="robots-file">robots.txt has not been fetched yet.</div>
              <div>
                <label class="field-label" for="robots-path">Archive path</label>
                <div class="inline-form">
                  <input class="field" id="robots-path" type="text" autocomplete="off" placeholder="/archive-xxxxx/">
                  <button class="action-btn primary" type="button" data-action="fetch-archive">Request path</button>
                </div>
              </div>
              <div class="panel-output" data-output="archive-result">Archive path not requested yet.</div>
            </div>
          `;
        },
        mount(root, api, challenge) {
          root.querySelector('[data-action="fetch-robots"]').addEventListener("click", async () => {
            const result = await api.request({ path: "/robots.txt" });
            api.renderHttp("robots-file", result);
          });

          root.querySelector('[data-action="fetch-archive"]').addEventListener("click", async () => {
            const requestPath = root.querySelector("#robots-path").value.trim();
            const result = await api.request({ path: requestPath || "/" });
            await syncSolveFromState(api, "archive-result", result, challenge.id, ["Hidden archive reached."]);
          });

          return null;
        }
      },
      6: {
        render(challenge) {
          return `
            <div class="lab-stack">
              ${solvedBanner(challenge)}
              <p class="lab-copy">This monitoring service was deployed and forgotten. Use common factory credentials against the live endpoint.</p>
              ${artifactList([
                "Endpoint: POST /api/default-login",
                "Goal: authenticate with a default pair"
              ])}
              <div>
                <label class="field-label" for="default-user">Username</label>
                <input class="field" id="default-user" type="text" autocomplete="off" placeholder="username">
              </div>
              <div>
                <label class="field-label" for="default-pass">Password</label>
                <input class="field" id="default-pass" type="password" autocomplete="off" placeholder="password">
              </div>
              <button class="action-btn primary" type="button" data-action="default-login">POST /api/default-login</button>
              <div class="panel-output" data-output="default-result">No login attempt yet.</div>
            </div>
          `;
        },
        mount(root, api) {
          root.querySelector('[data-action="default-login"]').addEventListener("click", async () => {
            const username = root.querySelector("#default-user").value.trim();
            const password = root.querySelector("#default-pass").value.trim();
            const result = await api.request({
              path: "/api/default-login",
              method: "POST",
              json: { username, password }
            });
            await applyJsonResult(api, "default-result", result);
          });

          return null;
        }
      },
      7: {
        render(challenge, api) {
          const reflectedUrl = api.apiUrl("/labs/reflected", { session: true });

          return `
            <div class="lab-stack">
              ${solvedBanner(challenge)}
              <p class="lab-copy">A live search page reflects input straight into the DOM. Make script execute inside the victim frame and let the target report it back.</p>
              ${artifactList([
                `Target: ${backendLink(api, "/labs/reflected", "/labs/reflected?q=...")}`,
                "Goal: achieve script execution inside the victim frame"
              ])}
              <div class="inline-form">
                <input class="field" id="reflected-payload" type="text" autocomplete="off" placeholder='payload for q parameter'>
                <button class="action-btn primary" type="button" data-action="load-reflected">Load payload into frame</button>
              </div>
              <div class="link-row">${backendLink(api, "/labs/reflected", "Open reflected target in a new tab")}</div>
              <div class="iframe-shell">
                <iframe class="lab-frame" id="reflected-frame" src="${reflectedUrl}" title="Reflected XSS lab"></iframe>
              </div>
              <div class="panel-output" data-output="reflected-result">Waiting for code execution in the target frame.</div>
            </div>
          `;
        },
        mount(root, api) {
          const frame = root.querySelector("#reflected-frame");
          const frameBase = api.apiUrl("/labs/reflected", { session: true });
          const listener = async (event) => {
            if (!event.data || event.data.type !== "hacklab-solved" || event.data.challengeId !== 7) {
              return;
            }

            await applyJsonResult(api, "reflected-result", {
              ok: true,
              status: 200,
              statusText: "OK",
              headers: [],
              text: "",
              json: event.data.data
            });
          };

          root.querySelector('[data-action="load-reflected"]').addEventListener("click", () => {
            const payload = root.querySelector("#reflected-payload").value;
            const target = new URL(frameBase);

            if (payload) {
              target.searchParams.set("q", payload);
            }

            frame.src = target.toString();
            api.messageText("reflected-result", "warning", [
              "Target loaded.",
              "If your payload executes, the frame will report the solve automatically."
            ]);
          });

          return api.listenMessages(listener);
        }
      },
      8: {
        render(challenge) {
          return `
            <div class="lab-stack">
              ${solvedBanner(challenge)}
              <p class="lab-copy">This login endpoint concatenates your input into a SQL query. You need to change the query logic, not just guess a valid password.</p>
              ${artifactList([
                "Endpoint: POST /api/sqli-login",
                "Goal: bypass the password check by altering the query structure"
              ])}
              <div>
                <label class="field-label" for="sqli-user">Username</label>
                <input class="field" id="sqli-user" type="text" autocomplete="off" placeholder="username">
              </div>
              <div>
                <label class="field-label" for="sqli-pass">Password</label>
                <input class="field" id="sqli-pass" type="text" autocomplete="off" placeholder="password">
              </div>
              <button class="action-btn primary" type="button" data-action="run-sqli-login">POST /api/sqli-login</button>
              <div class="panel-output" data-output="sqli-login-result">No login attempt yet.</div>
            </div>
          `;
        },
        mount(root, api) {
          root.querySelector('[data-action="run-sqli-login"]').addEventListener("click", async () => {
            const username = root.querySelector("#sqli-user").value;
            const password = root.querySelector("#sqli-pass").value;
            const result = await api.request({
              path: "/api/sqli-login",
              method: "POST",
              json: { username, password }
            });
            const extraHtml = result.json && result.json.query ? api.codeBlock(result.json.query) : "";
            await applyJsonResult(api, "sqli-login-result", result, extraHtml);
          });

          return null;
        }
      },
      9: {
        render(challenge, api) {
          return `
            <div class="lab-stack">
              ${solvedBanner(challenge)}
              <p class="lab-copy">The product search endpoint is injectable. Use a matching UNION query to pull rows from another table and line up the column count correctly.</p>
              ${artifactList([
                `Endpoint: ${backendLink(api, "/api/products?q=", "GET /api/products?q=...")}`,
                "Goal: expose rows from the secrets table"
              ])}
              <div class="inline-form">
                <input class="field" id="union-query" type="text" autocomplete="off" placeholder="search term or payload">
                <button class="action-btn primary" type="button" data-action="run-union-query">Request /api/products</button>
              </div>
              <div class="panel-output" data-output="union-result">No search request yet.</div>
            </div>
          `;
        },
        mount(root, api) {
          root.querySelector('[data-action="run-union-query"]').addEventListener("click", async () => {
            const query = root.querySelector("#union-query").value;
            const result = await api.request({ path: `/api/products?q=${encodeURIComponent(query)}` });
            const data = result.json;
            let extraHtml = "";

            if (data && data.query) {
              extraHtml += api.codeBlock(data.query);
            }

            if (data && Array.isArray(data.rows) && data.rows.length) {
              const columns = Object.keys(data.rows[0]).map((key) => ({ key, label: key }));
              extraHtml += api.table(columns, data.rows);
            }

            await applyJsonResult(api, "union-result", result, extraHtml);
          });

          return null;
        }
      },
      10: {
        render(challenge) {
          return `
            <div class="lab-stack">
              ${solvedBanner(challenge)}
              <p class="lab-copy">The token verifier trusts the decoded payload but never checks the signature. Pull a live token, tamper with it, and submit the modified version.</p>
              ${artifactList([
                "Endpoint: GET /api/jwt-token",
                "Endpoint: POST /api/jwt-check",
                "Goal: escalate the token role to admin"
              ])}
              <div class="inline-actions">
                <button class="action-btn secondary" type="button" data-action="issue-token">Issue token</button>
              </div>
              <div class="panel-output" data-output="jwt-issued">No token requested yet.</div>
              <div>
                <label class="field-label" for="jwt-token-input">Modified token</label>
                <input class="field" id="jwt-token-input" type="text" autocomplete="off" placeholder="header.payload.signature">
              </div>
              <button class="action-btn primary" type="button" data-action="verify-token">POST /api/jwt-check</button>
              <div class="panel-output" data-output="jwt-result">No token submitted yet.</div>
            </div>
          `;
        },
        mount(root, api) {
          root.querySelector('[data-action="issue-token"]').addEventListener("click", async () => {
            const result = await api.request({ path: "/api/jwt-token" });
            const extraHtml = result.json && result.json.token ? api.codeBlock(result.json.token) : "";
            await applyJsonResult(api, "jwt-issued", result, extraHtml);
          });

          root.querySelector('[data-action="verify-token"]').addEventListener("click", async () => {
            const token = root.querySelector("#jwt-token-input").value.trim();
            const result = await api.request({
              path: "/api/jwt-check",
              method: "POST",
              json: { token }
            });
            const extraHtml = result.json && result.json.payload
              ? api.codeBlock(JSON.stringify(result.json.payload, null, 2))
              : "";
            await applyJsonResult(api, "jwt-result", result, extraHtml);
          });

          return null;
        }
      },
      11: {
        render(challenge, api) {
          return `
            <div class="lab-stack">
              ${solvedBanner(challenge)}
              <p class="lab-copy">The profile endpoint trusts the numeric identifier you give it. Start with your own record and see what else is reachable.</p>
              ${artifactList([
                `Endpoint: ${backendLink(api, "/api/profile?id=1001", "GET /api/profile?id=...")}`,
                "Goal: retrieve a protected profile that leaks a vault ticket"
              ])}
              <div class="inline-form">
                <input class="field" id="profile-id" type="text" autocomplete="off" value="1001" placeholder="1001">
                <button class="action-btn primary" type="button" data-action="fetch-profile">Request profile</button>
              </div>
              <div class="panel-output" data-output="profile-result">No profile requested yet.</div>
            </div>
          `;
        },
        mount(root, api) {
          root.querySelector('[data-action="fetch-profile"]').addEventListener("click", async () => {
            const id = root.querySelector("#profile-id").value.trim();
            const result = await api.request({ path: `/api/profile?id=${encodeURIComponent(id)}` });
            const extraHtml = result.json && result.json.profile
              ? api.codeBlock(JSON.stringify(result.json.profile, null, 2))
              : "";
            await applyJsonResult(api, "profile-result", result, extraHtml);
          });

          return null;
        }
      },
      12: {
        render(challenge, api) {
          const commentsUrl = api.apiUrl("/labs/comments", { session: true });

          return `
            <div class="lab-stack">
              ${solvedBanner(challenge)}
              <p class="lab-copy">This board stores whatever it receives and renders it back for every visitor. Persist a payload that executes when the live board reloads.</p>
              ${artifactList([
                "Endpoint: POST /api/comments",
                `Target: ${backendLink(api, "/labs/comments", "/labs/comments")}`,
                "Goal: store script that runs for future viewers"
              ])}
              <div>
                <label class="field-label" for="comment-author">Author</label>
                <input class="field" id="comment-author" type="text" autocomplete="off" placeholder="anonymous">
              </div>
              <div>
                <label class="field-label" for="comment-body">Comment</label>
                <textarea class="textarea" id="comment-body" placeholder="comment payload"></textarea>
              </div>
              <div class="inline-actions">
                <button class="action-btn primary" type="button" data-action="post-comment">Post comment</button>
                <button class="action-btn secondary" type="button" data-action="reload-board">Reload board</button>
              </div>
              <div class="link-row">${backendLink(api, "/labs/comments", "Open comments board in a new tab")}</div>
              <div class="panel-output" data-output="comment-post-result">No comment posted yet.</div>
              <div class="iframe-shell">
                <iframe class="lab-frame" id="comments-frame" src="${commentsUrl}" title="Stored XSS lab"></iframe>
              </div>
              <div class="panel-output" data-output="stored-result">Waiting for the stored payload to execute.</div>
            </div>
          `;
        },
        mount(root, api) {
          const frame = root.querySelector("#comments-frame");
          const listener = async (event) => {
            if (!event.data || event.data.type !== "hacklab-solved" || event.data.challengeId !== 12) {
              return;
            }

            await applyJsonResult(api, "stored-result", {
              ok: true,
              status: 200,
              statusText: "OK",
              headers: [],
              text: "",
              json: event.data.data
            });
          };

          root.querySelector('[data-action="post-comment"]').addEventListener("click", async () => {
            const author = root.querySelector("#comment-author").value.trim();
            const text = root.querySelector("#comment-body").value;
            const result = await api.request({
              path: "/api/comments",
              method: "POST",
              json: { author, text }
            });
            await applyJsonResult(api, "comment-post-result", result);
            const target = new URL(api.apiUrl("/labs/comments", { session: true }));
            target.searchParams.set("ts", String(Date.now()));
            frame.src = target.toString();
          });

          root.querySelector('[data-action="reload-board"]').addEventListener("click", () => {
            const target = new URL(api.apiUrl("/labs/comments", { session: true }));
            target.searchParams.set("ts", String(Date.now()));
            frame.src = target.toString();
            api.messageText("stored-result", "warning", [
              "Board reloaded.",
              "If your payload is stored and executable, the solve will report automatically."
            ]);
          });

          return api.listenMessages(listener);
        }
      },
      13: {
        render(challenge, api) {
          return `
            <div class="lab-stack">
              ${solvedBanner(challenge)}
              <p class="lab-copy">The file endpoint removes the first <code>../</code> it sees and then resolves the path. Break out of the public directory and read the private file.</p>
              ${artifactList([
                `Endpoint: ${backendLink(api, "/api/file?path=docs/faq.txt", "GET /api/file?path=...")}`,
                "Goal: reach the private secret file outside the public directory"
              ])}
              <div class="inline-form">
                <input class="field" id="file-path" type="text" autocomplete="off" placeholder="docs/faq.txt">
                <button class="action-btn primary" type="button" data-action="fetch-file">Request file</button>
              </div>
              <div class="panel-output" data-output="file-result">No file requested yet.</div>
            </div>
          `;
        },
        mount(root, api, challenge) {
          root.querySelector('[data-action="fetch-file"]').addEventListener("click", async () => {
            const requestPath = root.querySelector("#file-path").value.trim();
            const result = await api.request({ path: `/api/file?path=${encodeURIComponent(requestPath)}` });
            await syncSolveFromState(api, "file-result", result, challenge.id, ["Traversal succeeded and the private file was exposed."]);
          });

          return null;
        }
      },
      14: {
        render(challenge, api) {
          return `
            <div class="lab-stack">
              ${solvedBanner(challenge)}
              <p class="lab-copy">This endpoint only tells you whether the condition was true or false. Use that behavior to recover the admin password, then submit it.</p>
              ${artifactList([
                `Endpoint: ${backendLink(api, "/api/blind-user?username=admin", "GET /api/blind-user?username=...")}`,
                "Endpoint: POST /api/blind-verify",
                "Goal: recover the full admin password from boolean probes"
              ])}
              <div class="inline-form">
                <input class="field" id="blind-probe" type="text" autocomplete="off" placeholder="username probe">
                <button class="action-btn primary" type="button" data-action="run-probe">Request /api/blind-user</button>
              </div>
              <div class="panel-output" data-output="blind-probe-result">No probe sent yet.</div>
              <div>
                <label class="field-label" for="blind-password">Recovered admin password</label>
                <div class="inline-form">
                  <input class="field" id="blind-password" type="text" autocomplete="off" placeholder="recovered password">
                  <button class="action-btn primary" type="button" data-action="submit-blind-password">POST /api/blind-verify</button>
                </div>
              </div>
              <div class="panel-output" data-output="blind-final-result">Password not submitted yet.</div>
            </div>
          `;
        },
        mount(root, api) {
          root.querySelector('[data-action="run-probe"]').addEventListener("click", async () => {
            const probe = root.querySelector("#blind-probe").value;
            const result = await api.request({ path: `/api/blind-user?username=${encodeURIComponent(probe)}` });
            const extraHtml = result.json && result.json.probe ? api.codeBlock(result.json.probe) : "";
            await applyJsonResult(api, "blind-probe-result", result, extraHtml);
          });

          root.querySelector('[data-action="submit-blind-password"]').addEventListener("click", async () => {
            const password = root.querySelector("#blind-password").value.trim();
            const result = await api.request({
              path: "/api/blind-verify",
              method: "POST",
              json: { password }
            });
            await applyJsonResult(api, "blind-final-result", result);
          });

          return null;
        }
      },
      15: {
        render(challenge, api) {
          return `
            <div class="lab-stack">
              ${solvedBanner(challenge)}
              <p class="lab-copy">The frontend normally calls the API as a regular user, but the backend trusts a caller-supplied role header. Send a better request and see what comes back.</p>
              ${artifactList([
                `Endpoint: ${backendLink(api, "/api/secret", "GET /api/secret")}`,
                "Header: X-User-Role",
                "Goal: access the protected secret by changing the role header"
              ])}
              <div>
                <label class="field-label" for="role-header">X-User-Role</label>
                <div class="inline-form">
                  <input class="field" id="role-header" type="text" autocomplete="off" value="user" placeholder="user">
                  <button class="action-btn primary" type="button" data-action="fetch-secret">Request /api/secret</button>
                </div>
              </div>
              <div class="panel-output" data-output="secret-result">No API request sent yet.</div>
            </div>
          `;
        },
        mount(root, api) {
          root.querySelector('[data-action="fetch-secret"]').addEventListener("click", async () => {
            const role = root.querySelector("#role-header").value.trim() || "user";
            const result = await api.request({
              path: "/api/secret",
              headers: {
                "X-User-Role": role
              }
            });
            const extraHtml = result.json && result.json.payload
              ? api.codeBlock(JSON.stringify(result.json.payload, null, 2))
              : "";
            await applyJsonResult(api, "secret-result", result, extraHtml);
          });

          return null;
        }
      }
    };
  };
})();
