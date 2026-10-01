/*
 * The setup wizard's page. Every step is one POST to `?action=<step>` with the
 * setup key in a header; the server (api/install/Wizard.php) does the work and
 * keeps the progress, so a closed tab or a timed-out request resumes where it
 * stopped. No framework and no build step: this file is shipped as written.
 */
(function () {
  "use strict";

  var STEPS = [
    ["unlock", "Key"], ["requirements", "Server"], ["database", "Database"], ["site", "Company"],
    ["install", "Install"], ["website", "Website"], ["scheduler", "Scheduler"], ["done", "Done"],
  ];
  var key = sessionStorage.getItem("tw-install-key") || "";
  var state = {};

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function show(step) {
    $$("[data-step]").forEach(function (el) { el.hidden = el.getAttribute("data-step") !== step; });
    var reached = STEPS.findIndex(function (s) { return s[0] === step; });
    $("#steps").innerHTML = STEPS.map(function (s, i) {
      var cls = i === reached ? "on" : i < reached ? "done" : "";
      return '<li class="' + cls + '">' + (i < reached ? "✓ " : "") + s[1] + "</li>";
    }).join("");
    var first = $("[data-step='" + step + "'] input:not([type=checkbox]):not([type=radio])");
    if (first) first.focus();
  }

  function call(action, body) {
    return fetch("?action=" + action, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Install-Key": key },
      body: JSON.stringify(body || {}),
    }).then(function (res) {
      return res.json().catch(function () {
        return { ok: false, message: "The server answered " + res.status + " without an explanation. Its error log (in the hosting panel) will say why." };
      });
    }, function () {
      return { ok: false, message: "The request did not reach the server. Check the connection and try again." };
    });
  }

  function fields(section) {
    var out = {};
    $$("input, select", section).forEach(function (el) {
      if (!el.name) return;
      if (el.type === "checkbox") out[el.name] = el.checked;
      else if (el.type === "radio") { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value;
    });
    return out;
  }

  function errors(section, res) {
    $$("[data-err]", section).forEach(function (el) { el.textContent = ""; });
    $$(".note", section).forEach(function (el) { if (!el.closest("#web-note") && !el.closest("#cron-note")) el.remove(); });
    if (res.ok) return false;
    var map = res.errors || {};
    Object.keys(map).forEach(function (field) {
      var el = $("[data-err='" + field + "']", section);
      if (el) el.textContent = map[field];
    });
    note(section, res.message || "Something went wrong.", "err");
    return true;
  }

  function note(section, text, tone) {
    var p = document.createElement("p");
    p.className = "note " + tone;
    p.textContent = text;
    var button = $("button", section);
    section.insertBefore(p, button);
  }

  function busy(button, on) {
    if (!button) return;
    button.disabled = on;
    if (on) { button.dataset.label = button.textContent; button.textContent = "Working…"; }
    else if (button.dataset.label) button.textContent = button.dataset.label;
  }

  /* ------------------------------------------------------------- steps */

  var actions = {
    unlock: function (section, button) {
      key = $("#key").value.trim().toUpperCase();
      return call("unlock").then(function (res) {
        if (res.ok) sessionStorage.setItem("tw-install-key", key);
        else { sessionStorage.removeItem("tw-install-key"); $("[data-err=key]").textContent = res.message; return; }
        state = res.state || {};
        prefill();
        resume();
      });
    },

    requirements: function (section) {
      return call("requirements").then(function (res) {
        if (errors(section, res)) return;
        $("#checks").innerHTML = res.checks.map(function (c) {
          var mark = c.ok ? '<b class="ok">✓</b>' : c.required ? '<b class="bad">✗</b>' : '<b class="maybe">!</b>';
          return "<li>" + mark + esc(c.label) + (c.ok ? "" : '<p class="hint">' + esc(c.detail) + "</p>") + "</li>";
        }).join("");
        $("#info").innerHTML = kv({ "PHP": res.info.php, "Time limit per request": res.info.max_execution_time, "Memory": res.info.memory_limit, "Installing into": res.info.home });
        $("#req-next").disabled = !res.satisfied;
        if (!res.satisfied) note(section, "Fix the items marked ✗ in the hosting panel, then press Check again.", "err");
      });
    },

    database: function (section) {
      return call("database", fields(section)).then(function (res) {
        if (res.errors && res.errors.confirm_not_empty) $("#db-confirm").hidden = false;
        if (errors(section, res)) return;
        if (res.warning) alert(res.warning);
        show("site");
      });
    },

    site: function (section) {
      return call("site", fields(section)).then(function (res) {
        if (errors(section, res)) return;
        (res.warnings || []).forEach(function (w) { alert(w); });
        show("install");
      });
    },

    install: function (section) {
      var bar = $("#install-bar");
      var detail = $("#install-detail");
      var fail = function (res) { errors(section, res); return Promise.reject(); };

      detail.textContent = "Writing the settings files…";
      return call("config")
        .then(function (res) { if (!res.ok) return fail(res); return migrate(); })
        .then(function () { detail.textContent = "Adding the starting content and your account…"; bar.style.width = "85%"; return call("seed"); })
        .then(function (res) { if (!res.ok) return fail(res); detail.textContent = "Finishing…"; return call("finalise"); })
        .then(function (res) {
          if (!res.ok) return fail(res);
          bar.style.width = "100%";
          detail.textContent = "Done.";
          return website();
        })
        .catch(function () {});

      function migrate() {
        return call("migrate").then(function (res) {
          if (!res.ok) return fail(res);
          var pct = Math.round(((res.total - res.remaining) / res.total) * 80);
          bar.style.width = pct + "%";
          detail.textContent = "Creating tables: " + (res.total - res.remaining) + " of " + res.total;
          return res.done ? null : migrate();
        });
      }
    },

    website: function () { return website(); },

    scheduler: function (section) {
      return call("scheduler").then(function (res) {
        if (errors(section, res)) return;
        $("#cron").textContent = res.cron;
        $("#cron-note").innerHTML = res.running
          ? '<p class="note ok">The scheduler is running.</p>'
          : '<p class="note warn">Not seen yet. It can take up to a minute after the cron job is saved.</p>';
        if (res.running) finish();
      });
    },

    finish: function () { return finish(); },
  };

  function website() {
    show("website");
    var section = $("[data-step=website]");
    return call("website").then(function (res) {
      if (errors(section, res)) return;
      $("#node").innerHTML = kv({
        "Node.js version": res.node.node_version + " (or 20)",
        "Application root": res.node.app_root,
        "Application URL": res.node.url,
        "Application startup file": res.node.startup_file,
        "Mode": "Production",
      });
      var box = $("#web-note");
      if (!res.connected) {
        var why = res.status === 0 ? "The website address does not answer yet." :
          res.reported && res.reported.site_url && res.reported.site_url !== res.node.url ? "The website answers, but with the address " + res.reported.site_url + " — restart the Node.js app so it reads its settings." :
          res.reported && res.reported.api && !res.reported.api.reachable ? "The website is running but cannot reach the API. Check that the API address is right and has SSL." :
          "The website answered " + res.status + ". Restart the Node.js app and check again.";
        box.innerHTML = '<p class="note warn">' + esc(why) + "</p>";
        return;
      }
      box.innerHTML = '<p class="note ok">The website is running version ' + esc(res.reported.version) + ". Preparing its pages…</p>";
      $("#warm-bar-wrap").hidden = false;
      return warm(0);
    });
  }

  function warm(from) {
    var section = $("[data-step=website]");
    return call("warm", { from: from }).then(function (res) {
      if (errors(section, res)) return;
      $("#warm-bar").style.width = Math.round((res.next / res.total) * 100) + "%";
      var stale = (res.pages || []).filter(function (p) { return p.stale; });
      if (stale.length) note(section, "Still showing an old copy: " + stale.map(function (p) { return p.path; }).join(", ") + ". This usually clears within a minute.", "warn");
      if (!res.done) return warm(res.next);
      show("scheduler");
      return actions.scheduler($("[data-step=scheduler]"));
    });
  }

  function finish() {
    var section = $("[data-step=scheduler]");
    return call("finish").then(function (res) {
      if (errors(section, res)) return;
      sessionStorage.removeItem("tw-install-key");
      $("#console-link").href = res.console;
      show("done");
    });
  }

  /* ----------------------------------------------------------- helpers */

  function resume() {
    var s = state.steps || {};
    if (s.warm) { show("scheduler"); return actions.scheduler($("[data-step=scheduler]")); }
    if (s.finalise) return website();
    if (s.site) return show("install");
    if (s.database) return show("site");
    show("requirements");
    return actions.requirements($("[data-step=requirements]"));
  }

  function prefill() {
    var d = state.defaults || {};
    var site = state.site || {};
    var db = state.db || {};
    setVal("#site-url", site.site_url || d.site_url);
    setVal("#api-url", site.api_url || d.api_url);
    ["company_name", "admin_name", "admin_email", "admin_phone", "mail_host", "mail_username", "mail_from"].forEach(function (n) {
      if (site[n]) setVal("[name=" + n + "]", site[n]);
    });
    ["host", "port", "database", "username"].forEach(function (n) { if (db[n]) setVal("[data-step=database] [name=" + n + "]", db[n]); });
  }

  function setVal(sel, value) { var el = $(sel); if (el && value !== undefined && value !== null) el.value = value; }

  function kv(map) {
    return Object.keys(map).map(function (k) { return "<dt>" + esc(k) + "</dt><dd>" + esc(String(map[k])) + "</dd>"; }).join("");
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  /* ------------------------------------------------------------ wiring */

  document.addEventListener("click", function (e) {
    var go = e.target.closest("[data-go]");
    var next = e.target.closest("[data-next]");
    if (next) { show(next.getAttribute("data-next")); return; }
    if (!go) return;
    e.preventDefault();
    var section = go.closest("[data-step]");
    busy(go, true);
    Promise.resolve(actions[go.getAttribute("data-go")](section, go)).then(
      function () { busy(go, false); },
      function () { busy(go, false); }
    );
  });

  $$("[name=mail]").forEach(function (el) {
    el.addEventListener("change", function () { $("#smtp").hidden = $("[name=mail]:checked").value !== "smtp"; });
  });

  $("#key").addEventListener("keydown", function (e) { if (e.key === "Enter") $("[data-go=unlock]").click(); });

  show("unlock");
  if (key) { $("#key").value = key; actions.unlock($("[data-step=unlock]")); }
})();
