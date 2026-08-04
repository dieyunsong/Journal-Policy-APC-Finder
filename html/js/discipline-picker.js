/**
 * discipline-picker.js
 *
 * Two-level discipline picker: closed it reads as a text box holding the chosen
 * topics as removable pills; opening shows the eight broad areas, and choosing one
 * drills into its topics with a count of covered journals beside each.
 *
 * Ported from the companion Journal-Policy-Finder repo. Two deliberate changes:
 * that version is an ES module and caps selections at 3, while this one is a
 * classic script (script.js relies on jQuery and $(document).ready, and making it
 * a module would change load timing around DataTables for no benefit) and allows
 * unlimited selections, because an interdisciplinary author filtering a table
 * should not be blocked at four topics.
 *
 * Owns its own keyboard and screen-reader behaviour because a custom panel gets
 * none for free: Escape closes and returns focus, arrows move between rows, and
 * the trigger reports aria-expanded.
 *
 * Exposes window.NUDiscipline.{buildDisciplineOptions, createDisciplinePicker}.
 */
(function (global) {
  "use strict";

  function escapeHtml(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /**
   * Shape the taxonomy into the two-level structure the picker shows: broad areas
   * first, each holding the topics that actually have journals.
   *
   * @param {Object} taxonomy - data.json's taxonomy: { areas, tag_list, tag_counts }
   * @returns {Array} groups
   */
  function buildDisciplineOptions(taxonomy) {
    var areas = (taxonomy && taxonomy.areas) || {};
    var tagList = (taxonomy && taxonomy.tag_list) || [];
    var counts = (taxonomy && taxonomy.tag_counts) || {};

    var idOf = {};
    tagList.forEach(function (slug, i) { idOf[slug] = i; });

    var groups = [];
    Object.keys(areas).forEach(function (areaId) {
      var area = areas[areaId];
      var subcategories = area.subcategories || {};
      var topics = [];

      Object.keys(subcategories).forEach(function (subSlug) {
        var id = idOf[areaId + "/" + subSlug];
        if (id === undefined) return;
        var count = counts[String(id)] || 0;
        // Drop topics no journal carries: offering one means clicking a topic that
        // returns nothing.
        if (count <= 0) return;
        topics.push({ id: id, label: subcategories[subSlug], count: count });
      });

      if (!topics.length) return;
      topics.sort(function (a, b) {
        return b.count - a.count || a.label.localeCompare(b.label);
      });
      groups.push({ areaId: areaId, areaLabel: area.label, topics: topics });
    });

    groups.sort(function (a, b) { return a.areaLabel.localeCompare(b.areaLabel); });
    return groups;
  }

  // Serial for panel ids, so two pickers on one page cannot collide even if neither
  // was given a triggerId.
  var pickerSeq = 0;

  /**
   * @param {HTMLElement} container
   * @param {Array} groups - from buildDisciplineOptions
   * @param {Object} options - { triggerId, onChange }
   */
  function createDisciplinePicker(container, groups, options) {
    var opts = options || {};
    var onChange = opts.onChange;
    var panelId = (opts.triggerId || "discipline-picker-" + (++pickerSeq)) + "-panel";
    var labels = {};
    groups.forEach(function (g) {
      g.topics.forEach(function (t) { labels[t.id] = t.label; });
    });

    var selected = [];
    var area = null; // null = showing the area list

    // The panel is a disclosure holding a two-level list of buttons and checkboxes —
    // not a listbox, a menu, or a dialog — so the honest ARIA is aria-expanded plus
    // aria-controls naming the panel. The sibling repo's aria-haspopup="listbox"
    // promised assistive tech single-select option semantics this widget does not
    // provide: there is no role="option" and no aria-selected anywhere in it.
    container.innerHTML =
      '<div class="picker-control">' +
      '<span class="picker-pills"></span>' +
      '<button type="button" class="picker-open"' +
      (opts.triggerId ? ' id="' + escapeHtml(opts.triggerId) + '"' : "") +
      ' aria-expanded="false" aria-controls="' + escapeHtml(panelId) + '">' +
      '<span class="picker-open-text">Select disciplines and topics</span>' +
      '<span class="picker-caret" aria-hidden="true">▾</span>' +
      "</button></div>" +
      '<div class="picker-panel" id="' + escapeHtml(panelId) + '" hidden></div>';

    var control = container.querySelector(".picker-control");
    var pillsEl = container.querySelector(".picker-pills");
    var openBtn = container.querySelector(".picker-open");
    var openText = container.querySelector(".picker-open-text");
    var panel = container.querySelector(".picker-panel");

    function isOpen() { return !panel.hidden; }

    function renderPills() {
      pillsEl.innerHTML = selected.map(function (id) {
        var label = escapeHtml(labels[id] || "");
        return '<span class="pill">' + label +
          '<button type="button" class="pill-x" data-id="' + id +
          '" aria-label="Remove ' + label + '">×</button></span>';
      }).join("");
      openText.textContent = selected.length ? "Add another"
                                            : "Select disciplines and topics";
      control.classList.toggle("has-pills", selected.length > 0);
    }

    function renderPanel() {
      if (!area) {
        panel.innerHTML = '<ul class="picker-list" role="list">' +
          groups.map(function (g) {
            return '<li><button type="button" class="picker-area" data-area="' +
              escapeHtml(g.areaId) + '"><span>' + escapeHtml(g.areaLabel) +
              '</span><span class="picker-meta">' + g.topics.length +
              " topics ›</span></button></li>";
          }).join("") + "</ul>";
        return;
      }

      var g = groups.filter(function (x) { return x.areaId === area; })[0];
      panel.innerHTML =
        '<div class="picker-crumb">' +
        '<button type="button" class="picker-back">‹ All areas</button>' +
        '<span class="picker-crumb-area">' + escapeHtml(g.areaLabel) + "</span></div>" +
        '<ul class="picker-list" role="list">' +
        g.topics.map(function (t) {
          var on = selected.indexOf(t.id) !== -1;
          return '<li><label class="picker-topic">' +
            '<input type="checkbox" value="' + t.id + '"' + (on ? " checked" : "") +
            '><span>' + escapeHtml(t.label) + '</span>' +
            '<span class="picker-meta">' + t.count.toLocaleString() +
            "</span></label></li>";
        }).join("") + "</ul>";
    }

    function open() {
      panel.hidden = false;
      openBtn.setAttribute("aria-expanded", "true");
      renderPanel();
      var first = panel.querySelector("button, input:not([disabled])");
      if (first) first.focus();
    }

    function close(focusTrigger) {
      panel.hidden = true;
      openBtn.setAttribute("aria-expanded", "false");
      area = null;
      if (focusTrigger) openBtn.focus();
    }

    function toggle(id, on) {
      var at = selected.indexOf(id);
      if (on && at === -1) {
        selected.push(id);
      } else if (!on && at !== -1) {
        selected.splice(at, 1);
      }
      renderPills();
      renderPanel();
      if (onChange) onChange(selected.slice());
    }

    openBtn.addEventListener("click", function () {
      if (isOpen()) { close(false); } else { open(); }
    });

    pillsEl.addEventListener("click", function (e) {
      var x = e.target.closest(".pill-x");
      if (x) toggle(Number(x.dataset.id), false);
    });

    panel.addEventListener("click", function (e) {
      var areaBtn = e.target.closest(".picker-area");
      if (areaBtn) {
        area = areaBtn.dataset.area;
        renderPanel();
        var back = panel.querySelector(".picker-back");
        if (back) back.focus();
        return;
      }
      if (e.target.closest(".picker-back")) {
        area = null;
        renderPanel();
        var firstArea = panel.querySelector(".picker-area");
        if (firstArea) firstArea.focus();
      }
    });

    panel.addEventListener("change", function (e) {
      var box = e.target.closest("input[type=checkbox]");
      if (box) toggle(Number(box.value), box.checked);
    });

    // Escape closes from anywhere inside; arrows walk the rows.
    container.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen()) {
        e.stopPropagation();
        close(true);
        return;
      }
      if (!isOpen() || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;

      var items = Array.prototype.slice.call(
        panel.querySelectorAll("button, input:not([disabled])"));
      if (!items.length) return;
      e.preventDefault();
      var at = items.indexOf(document.activeElement);
      var next = e.key === "ArrowDown" ? at + 1 : at - 1;
      items[(next + items.length) % items.length].focus();
    });

    document.addEventListener("mousedown", function (e) {
      if (isOpen() && !container.contains(e.target)) close(false);
    });

    renderPills();

    return {
      getSelected: function () { return selected.slice(); },
      clear: function () {
        selected.length = 0;
        renderPills();
        if (isOpen()) renderPanel();
      },
    };
  }

  global.NUDiscipline = {
    buildDisciplineOptions: buildDisciplineOptions,
    createDisciplinePicker: createDisciplinePicker,
  };
}(window));
