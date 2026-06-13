const navToggle = document.querySelector(".nav-toggle");
const mainNav = document.querySelector(".main-nav");

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const localhostHint = (path) =>
  location.protocol === "file:"
    ? `当前是 file:// 打开，浏览器可能限制读取 JSON 数据。请改用 http://localhost:8000/${path} 查看完整动态内容。`
    : "请确认数据文件可访问。";

const loadData = (url, key) => {
  if (window.SiteData?.[key]) {
    return Promise.resolve(window.SiteData[key]);
  }

  return fetch(url).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  });
};

if (navToggle && mainNav) {
  navToggle.addEventListener("click", () => {
    const isOpen = mainNav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    const value = button.getAttribute("data-filter");
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");

    document.querySelectorAll("[data-category]").forEach((card) => {
      const category = card.getAttribute("data-category");
      card.hidden = value !== "all" && category !== value;
    });
  });
});

const diseaseList = document.querySelector("#disease-list");
const diseaseSummary = document.querySelector("#disease-summary");
const diseaseSearch = document.querySelector("#disease-search");
const diseaseReset = document.querySelector("#disease-reset");
const diseaseFilters = document.querySelectorAll("[data-disease-filter]");

if (diseaseList && diseaseSummary) {
  let diseases = [];
  let activeDiseaseBatch = "all";
  let activeDiseaseQuery = "";

  const renderDiseases = () => {
    const query = activeDiseaseQuery.trim().toLowerCase();
    const filtered = diseases.filter((item) => {
      const matchesBatch = activeDiseaseBatch === "all" || String(item.batch) === activeDiseaseBatch;
      const haystack = [
        item.catalogNo,
        item.nameCn,
        item.nameEn,
        item.specialtyGroup,
        `batch${item.batch}`,
        `第${item.batch}批`
      ].join(" ").toLowerCase();
      return matchesBatch && (!query || haystack.includes(query));
    });

    diseaseSummary.textContent = `共收录 ${diseases.length} 种目录内疾病，当前显示 ${filtered.length} 种。专病方向待中心专家分组审核后补充。`;

    if (!filtered.length) {
      diseaseList.innerHTML = `<tr><td colspan="6"><div class="empty-state">没有找到匹配的目录内疾病。</div></td></tr>`;
      return;
    }

    diseaseList.innerHTML = filtered
      .map((item) => {
        const batchLabel = item.batch === 1 ? "第一批" : "第二批";
        return `
          <tr>
            <td>${batchLabel}</td>
            <td>${escapeHtml(item.catalogNo)}</td>
            <td><strong>${escapeHtml(item.nameCn)}</strong></td>
            <td>${escapeHtml(item.nameEn)}</td>
            <td>${escapeHtml(item.specialtyGroup)}</td>
            <td>${escapeHtml(item.reviewStatus)}</td>
          </tr>
        `;
      })
      .join("");
  };

  loadData("data/diseases.json", "diseases")
    .then((payload) => {
      diseases = Array.isArray(payload.items) ? payload.items : [];
      renderDiseases();
    })
    .catch(() => {
      diseaseSummary.textContent = "未能加载疾病数据。请用本地静态服务器打开本站，例如 node server.js。";
      diseaseList.innerHTML = `<tr><td colspan="6"><div class="empty-state">${localhostHint("diseases.html")}</div></td></tr>`;
    });

  diseaseFilters.forEach((button) => {
    button.addEventListener("click", () => {
      activeDiseaseBatch = button.getAttribute("data-disease-filter") || "all";
      diseaseFilters.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderDiseases();
    });
  });

  diseaseSearch?.addEventListener("input", (event) => {
    activeDiseaseQuery = event.target.value;
    renderDiseases();
  });

  diseaseReset?.addEventListener("click", () => {
    activeDiseaseBatch = "all";
    activeDiseaseQuery = "";
    if (diseaseSearch) diseaseSearch.value = "";
    diseaseFilters.forEach((item) => item.classList.toggle("active", item.getAttribute("data-disease-filter") === "all"));
    renderDiseases();
  });
}

const mdtDirectoryList = document.querySelector("#mdt-directory-list");
const mdtDirectorySummary = document.querySelector("#mdt-directory-summary");
const mdtSearch = document.querySelector("#mdt-search");
const mdtCampusFilter = document.querySelector("#mdt-campus-filter");
const mdtOnlineFilter = document.querySelector("#mdt-online-filter");
const mdtReset = document.querySelector("#mdt-reset");
const mdtResultCount = document.querySelector("#mdt-result-count");

if (mdtDirectoryList && mdtDirectorySummary) {
  let mdtCampuses = [];
  let activeMdtQuery = "";
  let activeMdtCampus = "all";
  let activeMdtOnline = "all";

  const renderMdtDirectory = () => {
    const query = activeMdtQuery.trim().toLowerCase();
    let visibleTeamCount = 0;
    const campusCards = mdtCampuses
      .map((campus) => {
        if (activeMdtCampus !== "all" && campus.name !== activeMdtCampus) return "";

        const teams = (campus.teams || []).filter((team) => {
          const matchesOnline =
            activeMdtOnline === "all" ||
            (activeMdtOnline === "online" && team.onlineBooking) ||
            (activeMdtOnline === "offline" && !team.onlineBooking);
          const haystack = `${campus.name} ${team.no} ${team.name} ${team.onlineBookingLabel}`.toLowerCase();
          return matchesOnline && (!query || haystack.includes(query));
        });

        if (!teams.length) return "";
        visibleTeamCount += teams.length;

        return `
          <article class="panel">
            <h3>${escapeHtml(campus.name)} <span class="mini-meta">${teams.length}/${escapeHtml(campus.teamCount)} 支团队</span></h3>
            <div class="team-list">
              ${teams
                .map((team) => {
                  const statusClass = team.onlineBooking ? "status" : "status off";
                  return `
                    <div class="team-row">
                      <span class="team-no">${escapeHtml(team.no)}</span>
                      <strong>${escapeHtml(team.name)}</strong>
                      <span class="${statusClass}">${escapeHtml(team.onlineBookingLabel)}</span>
                    </div>
                  `;
                })
                .join("")}
            </div>
          </article>
        `;
      })
      .join("");

    mdtDirectoryList.innerHTML = campusCards || `<div class="empty-state">没有找到匹配的 MDT 团队。</div>`;
    if (mdtResultCount) mdtResultCount.textContent = `当前显示 ${visibleTeamCount} 支 MDT 团队。`;
  };

  loadData("data/mdt-directory.json", "mdtDirectory")
    .then((payload) => {
      mdtCampuses = Array.isArray(payload.campuses) ? payload.campuses : [];
      const total = mdtCampuses.reduce((sum, campus) => sum + (campus.teamCount || 0), 0);
      mdtDirectorySummary.textContent = `共 ${mdtCampuses.length} 个院区、${total} 支 MDT 团队；可按院区、团队名称和线上预约状态筛选。`;

      if (mdtCampusFilter) {
        mdtCampusFilter.innerHTML = `<option value="all">全部院区</option>${mdtCampuses
          .map((campus) => `<option value="${escapeHtml(campus.name)}">${escapeHtml(campus.name)}</option>`)
          .join("")}`;
      }

      renderMdtDirectory();
    })
    .catch(() => {
      mdtDirectorySummary.textContent = "未能加载 MDT 目录数据。";
      mdtDirectoryList.innerHTML = `<div class="empty-state">${localhostHint("mdt.html")}</div>`;
    });

  mdtSearch?.addEventListener("input", (event) => {
    activeMdtQuery = event.target.value;
    renderMdtDirectory();
  });

  mdtCampusFilter?.addEventListener("change", (event) => {
    activeMdtCampus = event.target.value;
    renderMdtDirectory();
  });

  mdtOnlineFilter?.addEventListener("change", (event) => {
    activeMdtOnline = event.target.value;
    renderMdtDirectory();
  });

  mdtReset?.addEventListener("click", () => {
    activeMdtQuery = "";
    activeMdtCampus = "all";
    activeMdtOnline = "all";
    if (mdtSearch) mdtSearch.value = "";
    if (mdtCampusFilter) mdtCampusFilter.value = "all";
    if (mdtOnlineFilter) mdtOnlineFilter.value = "all";
    renderMdtDirectory();
  });
}

const pediatricScopeList = document.querySelector("#pediatric-scope-list");
const pediatricSummary = document.querySelector("#pediatric-summary");
const pediatricSearch = document.querySelector("#pediatric-search");
const pediatricCampusFilter = document.querySelector("#pediatric-campus-filter");
const pediatricReset = document.querySelector("#pediatric-reset");
const pediatricResultCount = document.querySelector("#pediatric-result-count");

if (pediatricScopeList && pediatricSummary) {
  let pediatricRecords = [];
  let activePediatricQuery = "";
  let activePediatricCampus = "总院";

  const renderPediatricScope = () => {
    const query = activePediatricQuery.trim().toLowerCase();
    const filtered = pediatricRecords.filter((record) => {
      const haystack = `${record.category} ${record.department} ${record.pediatricSubject}`.toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      return matchesQuery;
    });

    if (pediatricResultCount) {
      pediatricResultCount.textContent = `${activePediatricCampus} 当前显示 ${filtered.length} 条记录。`;
    }

    if (!filtered.length) {
      pediatricScopeList.innerHTML = `<div class="empty-state">没有找到匹配的未成年接诊资质记录。</div>`;
      return;
    }

    pediatricScopeList.innerHTML = filtered
      .map((record) => {
        const campus = record.campuses[activePediatricCampus] || {};
        return `
          <article class="query-card">
            <p class="mini-meta">${escapeHtml(record.category)} / ${escapeHtml(record.department)}</p>
            <h3>${escapeHtml(record.pediatricSubject)}</h3>
            <div class="query-meta">
              <span>资质<strong>${escapeHtml(campus.qualification || "-")}</strong></span>
            </div>
          </article>
        `;
      })
      .join("");
  };

  loadData("data/pediatric-scope.json", "pediatricScope")
    .then((payload) => {
      pediatricRecords = Array.isArray(payload.records) ? payload.records : [];
      pediatricSummary.textContent = `共提取 ${pediatricRecords.length} 条未成年患者接诊资质记录。请选择院区后查询。`;
      renderPediatricScope();
    })
    .catch(() => {
      pediatricSummary.textContent = "未能加载未成年患者资质数据。";
      pediatricScopeList.innerHTML = `<div class="empty-state">${localhostHint("visit.html")}</div>`;
    });

  pediatricSearch?.addEventListener("input", (event) => {
    activePediatricQuery = event.target.value;
    renderPediatricScope();
  });

  pediatricCampusFilter?.addEventListener("change", (event) => {
    activePediatricCampus = event.target.value;
    renderPediatricScope();
  });

  pediatricReset?.addEventListener("click", () => {
    activePediatricQuery = "";
    activePediatricCampus = "总院";
    if (pediatricSearch) pediatricSearch.value = "";
    if (pediatricCampusFilter) pediatricCampusFilter.value = "总院";
    renderPediatricScope();
  });
}

const floorplanList = document.querySelector("#floorplan-list");
const floorplanFilters = document.querySelector("#floorplan-filters");

if (floorplanList) {
  let floorplanItems = [];
  let activeFloorplanCampus = "all";

  const renderFloorplans = () => {
    const filtered = floorplanItems.filter((item) => activeFloorplanCampus === "all" || item.campus === activeFloorplanCampus);
    floorplanList.innerHTML = filtered
      .map((item) => `
        <a class="floorplan-card" href="${encodeURI(item.file)}" target="_blank" rel="noreferrer">
          <img src="${encodeURI(item.file)}" alt="${escapeHtml(item.campus)}${escapeHtml(item.title)}" loading="lazy">
          <div>
            <strong>${escapeHtml(item.campus)}</strong>
            <p class="mini-meta">${escapeHtml(item.title)}</p>
          </div>
        </a>
      `)
      .join("");
  };

  loadData("data/floorplans.json", "floorplans")
    .then((payload) => {
      floorplanItems = Array.isArray(payload.items) ? payload.items : [];
      const campuses = ["all", ...new Set(floorplanItems.map((item) => item.campus))];
      if (floorplanFilters) {
        floorplanFilters.innerHTML = campuses
          .map((campus) => {
            const label = campus === "all" ? "全部院区" : campus;
            return `<button class="filter-btn ${campus === "all" ? "active" : ""}" type="button" data-floorplan-campus="${escapeHtml(campus)}">${escapeHtml(label)}</button>`;
          })
          .join("");

        floorplanFilters.querySelectorAll("[data-floorplan-campus]").forEach((button) => {
          button.addEventListener("click", () => {
            activeFloorplanCampus = button.getAttribute("data-floorplan-campus") || "all";
            floorplanFilters.querySelectorAll("[data-floorplan-campus]").forEach((item) => item.classList.remove("active"));
            button.classList.add("active");
            renderFloorplans();
          });
        });
      }
      renderFloorplans();
    })
    .catch(() => {
      floorplanList.innerHTML = `<div class="empty-state">${localhostHint("visit.html")}</div>`;
    });
}
