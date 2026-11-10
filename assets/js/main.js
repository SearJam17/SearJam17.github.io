/* Tamera Taylor-Moore — portfolio scripts
   Two small features: the mobile menu and the project filters.
   The site works without JavaScript; these only add convenience. */

document.documentElement.classList.add("js");

document.addEventListener("DOMContentLoaded", function () {
  // ---------- Mobile navigation ----------
  var toggle = document.querySelector(".nav-toggle");
  var menu = document.getElementById("primary-menu");

  if (toggle && menu) {
    function closeMenu() {
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }

    toggle.addEventListener("click", function () {
      var open = menu.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    // Close after choosing a link, on Escape, or when clicking elsewhere
    menu.addEventListener("click", function (event) {
      if (event.target.closest("a")) closeMenu();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && menu.classList.contains("is-open")) {
        closeMenu();
        toggle.focus();
      }
    });
    document.addEventListener("click", function (event) {
      if (!menu.contains(event.target) && !toggle.contains(event.target)) closeMenu();
    });
  }

  // ---------- Project filters (homepage only) ----------
  var filterButtons = document.querySelectorAll(".filter-btn");
  var projects = document.querySelectorAll("[data-categories]");
  var status = document.getElementById("filter-status");

  filterButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var chosen = button.getAttribute("data-filter");

      filterButtons.forEach(function (b) {
        b.setAttribute("aria-pressed", b === button ? "true" : "false");
      });

      var shown = 0;
      projects.forEach(function (item) {
        var cats = item.getAttribute("data-categories").split(" ");
        var match = chosen === "all" || cats.indexOf(chosen) !== -1;
        item.hidden = !match;
        if (match) shown += 1;
      });

      if (status) {
        status.textContent = "Showing " + shown + (shown === 1 ? " project" : " projects") +
          (chosen === "all" ? "" : " in " + button.textContent.trim());
      }
    });
  });

  // ---------- Footer year ----------
  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
});
