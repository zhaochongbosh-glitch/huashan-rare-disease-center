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
  let diseaseDetails = [];
  let detailByDiseaseId = new Map();
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
      diseaseList.innerHTML = `<tr><td colspan="7"><div class="empty-state">没有找到匹配的目录内疾病。</div></td></tr>`;
      return;
    }

    diseaseList.innerHTML = filtered
      .map((item) => {
        const batchLabel = item.batch === 1 ? "第一批" : "第二批";
        const detail = detailByDiseaseId.get(item.id);
        const detailLink = detail
          ? `<a class="text-link" href="disease-detail.html?id=${encodeURIComponent(item.id)}">查看详情</a>`
          : `<span class="muted">待补充</span>`;
        return `
          <tr>
            <td>${batchLabel}</td>
            <td>${escapeHtml(item.catalogNo)}</td>
            <td><strong>${escapeHtml(item.nameCn)}</strong></td>
            <td>${escapeHtml(item.nameEn)}</td>
            <td>${escapeHtml(item.specialtyGroup)}</td>
            <td>${escapeHtml(item.reviewStatus)}</td>
            <td>${detailLink}</td>
          </tr>
        `;
      })
      .join("");
  };

  Promise.all([
    loadData("data/diseases.json", "diseases"),
    loadData("data/disease-details.json", "diseaseDetails").catch(() => ({ items: [] }))
  ])
    .then(([diseasePayload, detailPayload]) => {
      diseases = Array.isArray(diseasePayload.items) ? diseasePayload.items : [];
      diseaseDetails = Array.isArray(detailPayload.items) ? detailPayload.items : [];
      detailByDiseaseId = new Map(diseaseDetails.map((item) => [item.diseaseId, item]));
      renderDiseases();
    })
    .catch(() => {
      diseaseSummary.textContent = "未能加载疾病数据。请用本地静态服务器打开本站，例如 node server.js。";
      diseaseList.innerHTML = `<tr><td colspan="7"><div class="empty-state">${localhostHint("diseases.html")}</div></td></tr>`;
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

const diseaseDetailRoot = document.querySelector("#disease-detail-root");

if (diseaseDetailRoot) {
  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get("id");
  const requestedSlug = params.get("slug");

  const renderTags = (items = []) =>
    items.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("");

  const renderList = (items = []) =>
    `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;

  const renderGroupedCards = (items = [], className = "detail-card-grid") =>
    `<div class="${className}">${items
      .map(
        (group) => `
          <article class="detail-card">
            <h3>${escapeHtml(group.title)}</h3>
            ${group.description ? `<p>${escapeHtml(group.description)}</p>` : ""}
            ${group.subtitle ? `<p class="mini-meta">${escapeHtml(group.subtitle)}</p>` : ""}
            ${group.items?.length ? renderList(group.items) : ""}
            ${group.note ? `<p class="detail-note">${escapeHtml(group.note)}</p>` : ""}
          </article>
        `
      )
      .join("")}</div>`;

  const renderFaq = (items = []) =>
    `<div class="faq-list">${items
      .map(
        (item) => `
          <details>
            <summary>${escapeHtml(item.question)}</summary>
            <p>${escapeHtml(item.answer)}</p>
            ${item.items?.length ? renderList(item.items) : ""}
          </details>
        `
      )
      .join("")}</div>`;

  const renderMissingDisease = () => {
    diseaseDetailRoot.innerHTML = `
      <section class="page-hero">
        <div class="container page-title">
          <div class="breadcrumb"><a href="index.html">首页</a> / <a href="diseases.html">疾病知识库</a> / 疾病详情</div>
          <h1>未找到疾病详情</h1>
          <p>该疾病暂未建立详情页，或当前链接参数不完整。</p>
          <div class="button-row"><a class="btn" href="diseases.html">返回疾病知识库</a></div>
        </div>
      </section>
    `;
  };

  const renderDiseaseDetail = (detail, catalogItem) => {
    const catalogName = catalogItem?.nameCn || detail.catalogName || detail.displayName;
    const status = catalogItem?.reviewStatus || "待中心专家医学审核";
    const batchLabel = catalogItem?.batch === 1 ? "第一批目录" : catalogItem?.batch === 2 ? "第二批目录" : detail.directoryBatch;
    document.title = `${detail.displayName} | 疾病知识库 | 华山医院罕见病中心`;

    diseaseDetailRoot.innerHTML = `
      <section class="page-hero disease-detail-hero">
        <div class="container">
          <div class="breadcrumb"><a href="index.html">首页</a> / <a href="diseases.html">疾病知识库</a> / ${escapeHtml(detail.displayName)}</div>
          <div class="disease-detail-hero-grid">
            <div class="page-title">
              <p class="eyebrow">${escapeHtml(detail.directoryBatch)}</p>
              <h1>${escapeHtml(detail.displayName)}</h1>
              <p>${detail.summary.map((item) => escapeHtml(item)).join("</p><p>")}</p>
              <div class="tag-row">
                ${renderTags([batchLabel, detail.specialtyGroup, detail.shortName, status])}
              </div>
            </div>
            <aside class="detail-fact-panel">
              <dl>
                <div><dt>目录名称</dt><dd>${escapeHtml(catalogName)}</dd></div>
                <div><dt>英文名称</dt><dd>${escapeHtml(detail.englishName)}</dd></div>
                <div><dt>目录序号</dt><dd>${escapeHtml(catalogItem?.catalogNo || "-")}</dd></div>
                <div><dt>审核状态</dt><dd>${escapeHtml(status)}</dd></div>
              </dl>
              <div class="button-row stacked">
                <a class="btn" href="visit.html">预约就诊入口</a>
                <a class="btn secondary" href="mdt.html">MDT 申请说明</a>
              </div>
            </aside>
          </div>
        </div>
      </section>
      <section class="section">
        <div class="container disease-detail-layout">
          <article class="detail-main">
            <section class="detail-section intro-media">
              <div>
                <p class="eyebrow">Overview</p>
                <h2>疾病简介</h2>
                ${detail.summary.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
              </div>
              <figure>
                <img src="${escapeHtml(detail.heroImage)}" alt="${escapeHtml(detail.heroImageAlt)}">
                <figcaption>${escapeHtml(detail.heroImageAlt)}</figcaption>
              </figure>
            </section>

            <section class="detail-section">
              <div class="section-head compact"><div><p class="eyebrow">Symptoms</p><h2>常见症状</h2></div></div>
              ${renderGroupedCards(detail.symptoms)}
              ${
                detail.features?.length
                  ? `<div class="detail-alert"><strong>典型特点</strong><div class="tag-row">${renderTags(detail.features)}</div></div>`
                  : ""
              }
            </section>

            <section class="detail-section two-column">
              <div>
                <div class="section-head compact"><div><p class="eyebrow">Visit</p><h2>建议就诊方向</h2></div></div>
                ${renderGroupedCards([
                  { title: "首选科室", items: detail.visit.primary },
                  { title: "相关科室", items: detail.visit.related }
                ])}
              </div>
              <div>
                <div class="section-head compact"><div><p class="eyebrow">Materials</p><h2>初诊材料</h2><p>${escapeHtml(detail.materialsIntro)}</p></div></div>
                ${renderGroupedCards(detail.materials)}
              </div>
            </section>

            <section class="detail-section mdt-highlight">
              <div>
                <p class="eyebrow">MDT</p>
                <h2>${escapeHtml(detail.mdt.status)}</h2>
                <p>${escapeHtml(detail.mdt.description)}</p>
                ${detail.mdt.recommendedIntro ? `<p>${escapeHtml(detail.mdt.recommendedIntro)}</p>` : ""}
                ${renderList(detail.mdt.recommendedFor)}
              </div>
              <div>
                ${renderGroupedCards(detail.mdt.teams, "detail-card-grid one")}
              </div>
            </section>

            ${
              detail.classification
                ? `<section class="detail-section">
                    <div class="section-head compact"><div><p class="eyebrow">Types</p><h2>疾病分型</h2></div></div>
                    ${renderGroupedCards(detail.classification)}
                  </section>`
                : ""
            }

            <section class="detail-section">
              <div class="section-head compact"><div><p class="eyebrow">Research</p><h2>可关联临床研究</h2></div></div>
              ${renderGroupedCards(detail.research)}
            </section>

            <section class="detail-section">
              <div class="section-head compact"><div><p class="eyebrow">Policy</p><h2>政策医保提示</h2></div></div>
              ${renderGroupedCards(detail.policy)}
            </section>

            <section class="detail-section">
              <div class="section-head compact"><div><p class="eyebrow">FAQ</p><h2>患者常见问题</h2></div></div>
              ${renderFaq(detail.faq)}
            </section>

            <section class="detail-section">
              <div class="section-head compact"><div><p class="eyebrow">Keywords</p><h2>疾病关键词</h2></div></div>
              <div class="tag-row">${renderTags(detail.keywords)}</div>
            </section>
          </article>

          <aside class="detail-sidebar">
            <div class="panel sticky-panel">
              <h3>内容状态</h3>
              <p>${escapeHtml(status)}</p>
              <p class="mini-meta">来源：${escapeHtml(window.SiteData?.diseaseDetails?.metadata?.source || "疾病详情文档")}；更新时间：${escapeHtml(window.SiteData?.diseaseDetails?.metadata?.updatedAt || "待更新")}。</p>
              <div class="button-row stacked">
                <a class="btn" href="diseases.html">返回知识库</a>
                <a class="btn secondary" href="contact.html">反馈内容问题</a>
              </div>
            </div>
          </aside>
        </div>
      </section>
    `;
  };

  Promise.all([
    loadData("data/disease-details.json", "diseaseDetails"),
    loadData("data/diseases.json", "diseases")
  ])
    .then(([detailPayload, diseasePayload]) => {
      const details = Array.isArray(detailPayload.items) ? detailPayload.items : [];
      const catalog = Array.isArray(diseasePayload.items) ? diseasePayload.items : [];
      const detail = details.find((item) => item.diseaseId === requestedId || item.id === requestedSlug);
      const catalogItem = catalog.find((item) => item.id === detail?.diseaseId);
      if (!detail) {
        renderMissingDisease();
        return;
      }
      renderDiseaseDetail(detail, catalogItem);
    })
    .catch(() => {
      diseaseDetailRoot.innerHTML = `
        <section class="page-hero">
          <div class="container page-title">
            <div class="breadcrumb"><a href="index.html">首页</a> / <a href="diseases.html">疾病知识库</a> / 疾病详情</div>
            <h1>疾病详情加载失败</h1>
            <p>${localhostHint("disease-detail.html")}</p>
          </div>
        </section>
      `;
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

const publicationList = document.querySelector("#publication-list");
const publicationSummary = document.querySelector("#publication-summary");
const publicationSearch = document.querySelector("#publication-search");
const publicationReset = document.querySelector("#publication-reset");
const publicationResultCount = document.querySelector("#publication-result-count");

if (publicationList && publicationSummary) {
  let publications = [];
  let activePublicationQuery = "";

  const publicationHaystack = (item) =>
    [
      item.pmid,
      item.title,
      item.authorLine,
      item.journal,
      item.publicationDate,
      item.doi,
      item.abstract,
      ...(item.matchedAffiliations || []),
      ...(item.affiliations || [])
    ]
      .join(" ")
      .toLowerCase();

  const renderPublications = () => {
    const query = activePublicationQuery.trim().toLowerCase();
    const filtered = publications.filter((item) => !query || publicationHaystack(item).includes(query));

    if (publicationResultCount) {
      publicationResultCount.textContent = `当前显示 ${filtered.length} 篇文章。`;
    }

    if (!filtered.length) {
      publicationList.innerHTML = `<div class="empty-state">没有找到匹配的 PubMed 文章。</div>`;
      return;
    }

    publicationList.innerHTML = filtered
      .map((item) => {
        const affiliation =
          (item.matchedAffiliations || []).join("; ") ||
          (item.affiliations || [])[0] ||
          "单位信息待补充";
        const abstract = item.abstract || "PubMed 未提供摘要。";
        const abstractZh = item.abstractZh || "中文摘要待 OpenAI API 翻译后补充。";
        return `
          <article class="publication-card">
            <div class="publication-head">
              <p class="mini-meta">PMID ${escapeHtml(item.pmid)} · ${escapeHtml(item.publicationDate || "日期待补充")}</p>
              <a class="btn" href="${escapeHtml(item.pubmedUrl)}" target="_blank" rel="noreferrer">PubMed</a>
            </div>
            <h3>${escapeHtml(item.title)}</h3>
            <p><strong>作者：</strong>${escapeHtml(item.authorLine || "作者信息待补充")}</p>
            <p><strong>单位：</strong>${escapeHtml(affiliation)}</p>
            <p><strong>期刊：</strong>${escapeHtml(item.journal || "期刊信息待补充")}${item.doi ? ` · DOI ${escapeHtml(item.doi)}` : ""}</p>
            <details>
              <summary>查看摘要</summary>
              <p>${escapeHtml(abstract)}</p>
              <p><strong>中文摘要：</strong>${escapeHtml(abstractZh)}</p>
            </details>
          </article>
        `;
      })
      .join("");
  };

  loadData("data/publications.json", "publications")
    .then((payload) => {
      publications = Array.isArray(payload.items) ? payload.items : [];
      const metadata = payload.metadata || {};
      publicationSummary.textContent = `共检索到 ${publications.length} 篇 PubMed 文章，数据更新于 ${metadata.updatedAt || "待同步"}。检索策略：${metadata.searchStrategy || "待补充"}`;
      renderPublications();
    })
    .catch(() => {
      publicationSummary.textContent = "未能加载 PubMed 文章数据。";
      publicationList.innerHTML = `<div class="empty-state">${localhostHint("research.html")}</div>`;
    });

  publicationSearch?.addEventListener("input", (event) => {
    activePublicationQuery = event.target.value;
    renderPublications();
  });

  publicationReset?.addEventListener("click", () => {
    activePublicationQuery = "";
    if (publicationSearch) publicationSearch.value = "";
    renderPublications();
  });
}
