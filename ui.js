/**
 * @fileoverview UI interactions for the PROTO-NOOS website.
 * Handles accordion, navigation, scroll progress, command palette, and clipboard.
 */

document.addEventListener("DOMContentLoaded", function () {
  /* ========== ACCORDION ========== */
  const accordionHeaders = document.querySelectorAll(".accordion-header");
  // Track currently expanded header to avoid O(n) iteration
  let currentlyExpanded = null;

  accordionHeaders.forEach(function (header) {
    header.setAttribute("aria-expanded", "false");

    header.addEventListener("click", function (e) {
      e.preventDefault();
      const isExpanded = header.getAttribute("aria-expanded") === "true";

      // Close previously expanded header (O(1) instead of O(n))
      if (currentlyExpanded && currentlyExpanded !== header) {
        currentlyExpanded.setAttribute("aria-expanded", "false");
      }

      header.setAttribute("aria-expanded", !isExpanded ? "true" : "false");
      currentlyExpanded = !isExpanded ? header : null;
    });
  });

  /* ========== STICKY NAVIGATION ========== */
  const stickyNav = document.getElementById("stickyNav");
  const heroSection = document.querySelector(".hero");
  const navLinks = Array.from(document.querySelectorAll(".nav-link[href^=\"#\"]"));
  const trackedSections = navLinks
    .map((link) => {
      const targetId = link.getAttribute("href").slice(1);
      return {
        id: targetId,
        link: link,
        section: document.getElementById(targetId)
      };
    })
    .filter((entry) => entry.section);

  function setActiveNavLink(activeId) {
    navLinks.forEach((link) => {
      const isActive = link.getAttribute("href") === "#" + activeId;
      link.classList.toggle("is-active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function updateActiveNavLink() {
    if (!trackedSections.length) return;

    const navHeight = stickyNav ? stickyNav.offsetHeight : 0;
    const threshold = navHeight + 36;
    let activeSectionId = trackedSections[0].id;

    trackedSections.forEach((entry) => {
      const rectTop = entry.section.getBoundingClientRect().top;
      if (rectTop <= threshold) {
        activeSectionId = entry.id;
      }
    });

    const nearPageBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (nearPageBottom) {
      activeSectionId = trackedSections[trackedSections.length - 1].id;
    }

    setActiveNavLink(activeSectionId);
  }

  function checkNavVisibility() {
    if (!heroSection || !stickyNav) return;

    const heroBottom = heroSection.offsetTop + heroSection.offsetHeight;
    const scrollPosition = window.scrollY;

    if (scrollPosition > heroBottom - 100) {
      stickyNav.classList.add("visible");
    } else {
      stickyNav.classList.remove("visible");
    }
  }

  /* ========== SCROLL PROGRESS BAR ========== */
  const progressBar = document.getElementById("scrollProgress");
  function updateScrollProgress() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight > 0 && progressBar) {
      progressBar.style.width = ((scrollTop / docHeight) * 100).toFixed(2) + "%";
    }
  }

  /* ========== PERSISTENT SCROLL STATE ========== */
  const SCROLL_KEY = "sknwpl_scroll_y";
  const savedY = sessionStorage.getItem(SCROLL_KEY);
  if (savedY !== null) {
    requestAnimationFrame(function () {
      window.scrollTo({ top: parseInt(savedY, 10), behavior: "instant" });
    });
  }

  /* ========== CONSOLIDATED SCROLL HANDLER (RAF-based) ========== */
  let scrollScheduled = false;
  function onScroll() {
    if (scrollScheduled) return;
    scrollScheduled = true;
    requestAnimationFrame(function () {
      checkNavVisibility();
      updateActiveNavLink();
      updateScrollProgress();
      sessionStorage.setItem(SCROLL_KEY, String(Math.round(window.scrollY)));
      scrollScheduled = false;
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", updateActiveNavLink, { passive: true });
  
  // Initial state
  updateActiveNavLink();
  checkNavVisibility();
  updateScrollProgress();

  /* ========== COPY-TO-CLIPBOARD BUTTONS ========== */
  document.querySelectorAll(".copy-btn[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      var text = btn.getAttribute("data-copy");
      if (!text) return;
      navigator.clipboard.writeText(text).then(function () {
        btn.classList.add("copied");
        var orig = btn.textContent;
        btn.textContent = "COPIED";
        setTimeout(function () {
          btn.textContent = orig;
          btn.classList.remove("copied");
        }, 1600);
      }).catch(function () {
        /* fallback: select in a textarea */
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;left:-9999px;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        btn.classList.add("copied");
        var origFb = btn.textContent;
        btn.textContent = "COPIED";
        setTimeout(function () { btn.textContent = origFb; btn.classList.remove("copied"); }, 1600);
      });
    });
  });

  /* ========== CMD+K COMMAND PALETTE ========== */
  var cmdkOverlay = document.getElementById("cmdkOverlay");
  var cmdkInput = document.getElementById("cmdkInput");
  var cmdkResults = document.getElementById("cmdkResults");
  var cmdkActiveIdx = -1;

  // Detect which page we're on and build appropriate commands
  var isAqp4Page = location.pathname.indexOf("aqp4") !== -1;
  
  var cmdkCommands = isAqp4Page ? [
    // AQP4 page commands
    { icon: "\u2302", label: "Kontekst sekcji", hint: "start home", action: function () { location.hash = "#kontekst-sekcji"; } },
    { icon: "\u2261", label: "Projekty", hint: "projects workflow", action: function () { location.hash = "#projekty"; } },
    { icon: "+", label: "Do\u0142\u0105cz", hint: "join team", action: function () { location.hash = "#dolacz"; } },
    { icon: "\u25b6", label: "PROTO-NOOS", hint: "main microorganisms", action: function () { location.href = "index.html"; } },
    { icon: "\u2709", label: "Copy email", hint: "clipboard contact", action: function () {
      navigator.clipboard.writeText("sknwpl@proton.me").then(function(){}).catch(function(){});
    }},
    { icon: "EN", label: "Switch to English", hint: "language", action: function () {
      if (window.i18n) window.i18n.setLanguage("en");
    }},
    { icon: "PL", label: "Prze\u0142\u0105cz na polski", hint: "j\u0119zyk", action: function () {
      if (window.i18n) window.i18n.setLanguage("pl");
    }},
    { icon: "\u21e7", label: "Scroll to top", hint: "top", action: function () { window.scrollTo({ top: 0, behavior: "smooth" }); } }
  ] : [
    // Main page (index.html) commands
    { icon: "\u2302", label: "Start", hint: "home", action: function () { location.hash = "#kontekst-sekcji"; } },
    { icon: "\u25b6", label: "Pipeline", hint: "stages", action: function () { location.hash = "#pipeline"; } },
    { icon: "\u2261", label: "Status", hint: "tasks", action: function () { location.hash = "#status"; } },
    { icon: "+", label: "Do\u0142\u0105cz", hint: "join", action: function () { location.hash = "#dolacz"; } },
    { icon: "\u2764", label: "Wsparcie", hint: "support", action: function () { location.hash = "#support"; } },
    { icon: "\u26a0", label: "Archiwum: AQP4", hint: "aqp4 archive", action: function () { location.href = "aqp4.html"; } },
    { icon: "\u2709", label: "Copy email", hint: "clipboard", action: function () {
      navigator.clipboard.writeText("sknwpl@proton.me").then(function(){}).catch(function(){});
    }},
    { icon: "EN", label: "Switch to English", hint: "language", action: function () {
      if (window.i18n) window.i18n.setLanguage("en");
    }},
    { icon: "PL", label: "Prze\u0142\u0105cz na polski", hint: "j\u0119zyk", action: function () {
      if (window.i18n) window.i18n.setLanguage("pl");
    }},
    { icon: "\u21e7", label: "Scroll to top", hint: "top", action: function () { window.scrollTo({ top: 0, behavior: "smooth" }); } }
  ];

  function openCmdk() {
    if (!cmdkOverlay) return;
    cmdkOverlay.classList.add("open");
    cmdkInput.value = "";
    cmdkActiveIdx = -1;
    renderCmdk("");
    requestAnimationFrame(function () { cmdkInput.focus(); });
  }

  function closeCmdk() {
    if (!cmdkOverlay) return;
    cmdkOverlay.classList.remove("open");
    cmdkInput.blur();
  }

  function renderCmdk(query) {
    var q = query.toLowerCase().trim();
    var matches = cmdkCommands.filter(function (c) {
      if (!q) return true;
      return c.label.toLowerCase().indexOf(q) !== -1 || c.hint.toLowerCase().indexOf(q) !== -1;
    });
    cmdkResults.innerHTML = "";
    if (matches.length === 0) {
      cmdkResults.innerHTML = '<div class="cmdk-empty">No results</div>';
      return;
    }
    matches.forEach(function (cmd, idx) {
      var el = document.createElement("button");
      el.className = "cmdk-item" + (idx === cmdkActiveIdx ? " active" : "");
      el.setAttribute("role", "option");
      
      // Build DOM safely without innerHTML to avoid XSS
      var iconSpan = document.createElement("span");
      iconSpan.className = "cmdk-item-icon";
      iconSpan.textContent = cmd.icon;
      
      var labelSpan = document.createElement("span");
      labelSpan.className = "cmdk-item-label";
      labelSpan.textContent = cmd.label;
      
      var hintSpan = document.createElement("span");
      hintSpan.className = "cmdk-item-hint";
      hintSpan.textContent = cmd.hint;
      
      el.appendChild(iconSpan);
      el.appendChild(labelSpan);
      el.appendChild(hintSpan);
      
      el.addEventListener("click", function () { cmd.action(); closeCmdk(); });
      el.addEventListener("mouseenter", function () {
        cmdkActiveIdx = idx;
        highlightCmdk();
      });
      cmdkResults.appendChild(el);
    });
  }

  function highlightCmdk() {
    var items = cmdkResults.querySelectorAll(".cmdk-item");
    items.forEach(function (el, i) {
      el.classList.toggle("active", i === cmdkActiveIdx);
    });
  }

  function getVisibleCmdkItems() {
    return cmdkResults.querySelectorAll(".cmdk-item");
  }

  document.addEventListener("keydown", function (e) {
    /* Ctrl+K or Cmd+K to open */
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      if (cmdkOverlay && cmdkOverlay.classList.contains("open")) {
        closeCmdk();
      } else {
        openCmdk();
      }
      return;
    }
    if (!cmdkOverlay || !cmdkOverlay.classList.contains("open")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeCmdk();
      return;
    }
    var items = getVisibleCmdkItems();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      cmdkActiveIdx = Math.min(cmdkActiveIdx + 1, items.length - 1);
      highlightCmdk();
      if (items[cmdkActiveIdx]) items[cmdkActiveIdx].scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      cmdkActiveIdx = Math.max(cmdkActiveIdx - 1, 0);
      highlightCmdk();
      if (items[cmdkActiveIdx]) items[cmdkActiveIdx].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        cmdkActiveIdx = Math.max(cmdkActiveIdx - 1, 0);
      } else {
        cmdkActiveIdx = Math.min(cmdkActiveIdx + 1, items.length - 1);
      }
      highlightCmdk();
      if (items[cmdkActiveIdx]) items[cmdkActiveIdx].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[cmdkActiveIdx]) items[cmdkActiveIdx].click();
    }
  });

  if (cmdkInput) {
    cmdkInput.addEventListener("input", function () {
      cmdkActiveIdx = 0;
      renderCmdk(cmdkInput.value);
    });
  }

  if (cmdkOverlay) {
    cmdkOverlay.addEventListener("click", function (e) {
      if (e.target === cmdkOverlay) closeCmdk();
    });
  }

  /* ========== CMDK TRIGGER BUTTON IN NAV ========== */
  var cmdkTriggerBtn = document.getElementById("cmdkTrigger");
  if (cmdkTriggerBtn) {
    cmdkTriggerBtn.addEventListener("click", function (e) {
      e.preventDefault();
      openCmdk();
    });
  }
});
