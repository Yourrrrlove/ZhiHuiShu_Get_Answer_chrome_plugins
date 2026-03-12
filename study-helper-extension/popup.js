const STORAGE_KEY = "study_entries_v1";
const STATUS_ORDER = ["new", "reviewing", "mastered"];
const STATUS_LABELS = {
  new: "待消化",
  reviewing: "复习中",
  mastered: "已掌握"
};

const form = document.getElementById("entry-form");
const formMessage = document.getElementById("form-message");
const entryList = document.getElementById("entry-list");
const stats = document.getElementById("stats");
const searchInput = document.getElementById("search");
const statusFilter = document.getElementById("status-filter");
const statusInput = document.getElementById("status");
const clearFormButton = document.getElementById("clear-form");
const exportButton = document.getElementById("export-json");
const emptyStateTemplate = document.getElementById("empty-state-template");
const canUseChromeStorage = Boolean(
  globalThis.chrome &&
    chrome.storage &&
    chrome.storage.local &&
    typeof chrome.storage.local.get === "function"
);

let entries = [];

document.addEventListener("DOMContentLoaded", async () => {
  await seedDemoEntriesIfNeeded();
  entries = await loadEntries();
  render();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const question = String(formData.get("question") || "").trim();
  const analysis = String(formData.get("analysis") || "").trim();

  if (!question || !analysis) {
    setFormMessage("题目和解析是必填项。");
    return;
  }

  const entry = {
    id: createId(),
    course: String(formData.get("course") || "").trim(),
    question,
    analysis,
    takeaways: String(formData.get("takeaways") || "").trim(),
    status: String(formData.get("status") || "new"),
    tags: parseTags(String(formData.get("tags") || "")),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  entries.unshift(entry);
  await persistEntries();
  form.reset();
  statusInput.value = "new";
  setFormMessage("已保存到本地学习库。");
  render();
});

searchInput.addEventListener("input", render);
statusFilter.addEventListener("change", render);

clearFormButton.addEventListener("click", () => {
  form.reset();
  statusInput.value = "new";
  setFormMessage("");
});

exportButton.addEventListener("click", () => {
  const payload = JSON.stringify(entries, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "study-helper-entries.json";
  anchor.click();
  URL.revokeObjectURL(url);
});

async function loadEntries() {
  if (canUseChromeStorage) {
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  }

  const rawValue = localStorage.getItem(STORAGE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function persistEntries() {
  if (canUseChromeStorage) {
    await chrome.storage.local.set({ [STORAGE_KEY]: entries });
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function render() {
  const filtered = getFilteredEntries();
  renderStats();
  renderEntryList(filtered);
}

function renderStats() {
  const counts = STATUS_ORDER.reduce((accumulator, status) => {
    accumulator[status] = entries.filter((entry) => entry.status === status).length;
    return accumulator;
  }, {});

  stats.replaceChildren(
    buildStatPill(`总计 ${entries.length}`),
    buildStatPill(`待消化 ${counts.new}`),
    buildStatPill(`复习中 ${counts.reviewing}`),
    buildStatPill(`已掌握 ${counts.mastered}`)
  );
}

function renderEntryList(filteredEntries) {
  entryList.replaceChildren();

  if (!filteredEntries.length) {
    entryList.appendChild(emptyStateTemplate.content.cloneNode(true));
    return;
  }

  filteredEntries.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "entry-card";

    const top = document.createElement("div");
    top.className = "entry-top";

    const headingWrap = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = entry.course || "未命名课程";
    const meta = document.createElement("div");
    meta.className = "entry-meta";
    meta.textContent = `更新于 ${formatDate(entry.updatedAt)}`;
    headingWrap.append(title, meta);

    const status = document.createElement("span");
    status.className = "status-pill";
    status.dataset.status = entry.status;
    status.textContent = STATUS_LABELS[entry.status] || entry.status;

    top.append(headingWrap, status);
    card.appendChild(top);

    card.append(
      buildSection("题目 / 知识点", entry.question),
      buildSection("你的解析", entry.analysis)
    );

    if (entry.takeaways) {
      card.appendChild(buildSection("关键结论", entry.takeaways));
    }

    if (entry.tags.length) {
      const tagsWrap = document.createElement("div");
      tagsWrap.className = "entry-tags";
      entry.tags.forEach((tag) => {
        const tagNode = document.createElement("span");
        tagNode.className = "tag";
        tagNode.textContent = tag;
        tagsWrap.appendChild(tagNode);
      });
      card.appendChild(tagsWrap);
    }

    const actions = document.createElement("div");
    actions.className = "entry-actions";

    const cycleButton = document.createElement("button");
    cycleButton.className = "small-button";
    cycleButton.type = "button";
    cycleButton.textContent = "切换状态";
    cycleButton.addEventListener("click", async () => {
      entry.status = nextStatus(entry.status);
      entry.updatedAt = new Date().toISOString();
      await persistEntries();
      render();
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "small-button";
    deleteButton.type = "button";
    deleteButton.textContent = "删除";
    deleteButton.addEventListener("click", async () => {
      entries = entries.filter((item) => item.id !== entry.id);
      await persistEntries();
      render();
    });

    actions.append(cycleButton, deleteButton);
    card.appendChild(actions);

    entryList.appendChild(card);
  });
}

function buildSection(titleText, bodyText) {
  const section = document.createElement("section");
  const title = document.createElement("p");
  title.className = "entry-section-title";
  title.textContent = titleText;
  const body = document.createElement("p");
  body.className = "entry-copy";
  body.textContent = bodyText;
  section.append(title, body);
  return section;
}

function buildStatPill(label) {
  const pill = document.createElement("span");
  pill.className = "stat-pill";
  pill.textContent = label;
  return pill;
}

function getFilteredEntries() {
  const keyword = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;

  return entries
    .filter((entry) => {
      if (status !== "all" && entry.status !== status) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const haystack = [
        entry.course,
        entry.question,
        entry.analysis,
        entry.takeaways,
        entry.tags.join(" ")
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(keyword);
    })
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
}

function parseTags(input) {
  return input
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function nextStatus(currentStatus) {
  const currentIndex = STATUS_ORDER.indexOf(currentStatus);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % STATUS_ORDER.length;
  return STATUS_ORDER[nextIndex];
}

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function setFormMessage(message) {
  formMessage.textContent = message;
}

async function seedDemoEntriesIfNeeded() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1") {
    return;
  }

  const existingEntries = await loadEntries();
  if (existingEntries.length) {
    return;
  }

  entries = [
    {
      id: "demo-1",
      course: "高等数学",
      question: "证明当 x 趋近于 0 时，sin(x) / x 的极限为 1，并总结适用场景。",
      analysis:
        "先用单位圆和夹逼定理建立 sin(x) < x < tan(x)，再化成 cos(x) < sin(x)/x < 1。最后由 cos(x) 趋近于 1 得出结论。复习时要重点记住：这个结论常用来处理三角函数的局部线性近似。",
      takeaways: "夹逼定理 + 局部线性近似；见到 sin(x)/x 优先考虑基础极限。",
      status: "reviewing",
      tags: ["极限", "夹逼定理"],
      createdAt: "2026-03-12T09:00:00.000Z",
      updatedAt: "2026-03-12T09:00:00.000Z"
    },
    {
      id: "demo-2",
      course: "数据结构",
      question: "比较二叉搜索树和哈希表在查找、范围查询、顺序遍历上的差异。",
      analysis:
        "哈希表平均查找快，但不适合范围查询，也不保序。二叉搜索树在平衡时查找复杂度稳定，还能支持中序遍历输出有序结果。整理面试题时要把‘是否需要顺序信息’作为选型判断点。",
      takeaways: "是否保序、是否需要范围查询，是 BST 与 Hash 的核心分界线。",
      status: "new",
      tags: ["查找", "数据结构"],
      createdAt: "2026-03-12T09:05:00.000Z",
      updatedAt: "2026-03-12T09:05:00.000Z"
    }
  ];

  await persistEntries();
}
