const STORE_KEY = "toefl-pwa-progress-v1";
const SLOTS = [
  { id: "morning", label: "早起", title: "新单词" },
  { id: "noon", label: "中午", title: "巩固新单词" },
  { id: "evening", label: "傍晚", title: "再次巩固" },
  { id: "bedtime", label: "睡前", title: "抗遗忘复习" },
];
const REVIEW_OFFSETS = [14, 6, 3, 1, 0];

let wordData = null;
let state = loadState();
let selectedDay = dayFromStart(state.startDate);
let selectedSlot = currentSlot();
let activeList = listForSerial(selectedDay);
let availableVoices = [];

const $ = (id) => document.getElementById(id);

const elements = {
  todayPill: $("todayPill"),
  dayTitle: $("dayTitle"),
  daySubtitle: $("daySubtitle"),
  startDateInput: $("startDateInput"),
  dayInput: $("dayInput"),
  prevDay: $("prevDay"),
  nextDay: $("nextDay"),
  slotLabel: $("slotLabel"),
  taskTitle: $("taskTitle"),
  taskLists: $("taskLists"),
  completeTask: $("completeTask"),
  dayProgressBar: $("dayProgressBar"),
  dayProgressText: $("dayProgressText"),
  listSelect: $("listSelect"),
  statusFilter: $("statusFilter"),
  searchInput: $("searchInput"),
  activeListMeta: $("activeListMeta"),
  activeListTitle: $("activeListTitle"),
  completeTaskBottom: $("completeTaskBottom"),
  wordStats: $("wordStats"),
  words: $("words"),
  resetProgress: $("resetProgress"),
  offlineStatus: $("offlineStatus"),
};

init();

async function init() {
  bindEvents();
  initSpeech();
  registerServiceWorker();
  const response = await fetch("data/words.json?v=3");
  wordData = await response.json();
  buildListOptions();
  render();
}

function bindEvents() {
  elements.startDateInput.addEventListener("change", () => {
    state.startDate = elements.startDateInput.value || todayISO();
    selectedDay = dayFromStart(state.startDate);
    activeList = listForSerial(selectedDay);
    saveState();
    render();
  });

  elements.dayInput.addEventListener("change", () => {
    updateSelectedDayFromInput();
  });

  elements.dayInput.addEventListener("input", () => {
    updateSelectedDayFromInput();
  });

  elements.dayInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      updateSelectedDayFromInput();
      elements.dayInput.blur();
    }
  });

  function updateSelectedDayFromInput() {
    selectedDay = clampDay(Number(elements.dayInput.value) || 1);
    activeList = listForSerial(selectedDay);
    render();
  }

  elements.prevDay.addEventListener("click", () => {
    selectedDay = clampDay(selectedDay - 1);
    activeList = listForSerial(selectedDay);
    render();
  });

  elements.nextDay.addEventListener("click", () => {
    selectedDay = clampDay(selectedDay + 1);
    activeList = listForSerial(selectedDay);
    render();
  });

  document.querySelectorAll(".slot-tab").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSlot = button.dataset.slot;
      if (selectedSlot === "bedtime") {
        activeList = reviewSerials(selectedDay).map(listForSerial).at(-1) || activeList;
      } else {
        activeList = listForSerial(selectedDay);
      }
      render();
    });
  });

  elements.completeTask.addEventListener("click", toggleCurrentTask);
  elements.completeTaskBottom.addEventListener("click", toggleCurrentTask);

  elements.listSelect.addEventListener("change", () => {
    activeList = Number(elements.listSelect.value);
    renderWords();
  });

  elements.statusFilter.addEventListener("change", renderWords);
  elements.searchInput.addEventListener("input", renderWords);


  elements.resetProgress.addEventListener("click", () => {
    const ok = window.confirm("确定清除所有打卡和单词熟悉度吗？这个操作不能撤销。");
    if (!ok) return;
    state = defaultState();
    selectedDay = dayFromStart(state.startDate);
    selectedSlot = currentSlot();
    activeList = listForSerial(selectedDay);
    saveState();
    render();
  });
}

function render() {
  if (!wordData) return;
  const plan = dayPlan(selectedDay);
  const slotInfo = SLOTS.find((slot) => slot.id === selectedSlot);
  const taskLists = selectedSlot === "bedtime" ? plan.bedtimeReviewLists : [plan.newList];
  const completed = Boolean(state.completedTasks[taskKey(selectedDay, selectedSlot)]);
  const completedCount = SLOTS.filter((slot) => state.completedTasks[taskKey(selectedDay, slot.id)]).length;

  elements.todayPill.textContent = formatToday();
  elements.dayTitle.textContent = `第 ${selectedDay} 天`;
  elements.daySubtitle.textContent = subtitleForPlan(plan);
  elements.startDateInput.value = state.startDate;
  elements.dayInput.value = selectedDay;
  elements.slotLabel.textContent = slotInfo.label;
  elements.taskTitle.textContent = slotInfo.title;
  syncCompleteButtons(completed);
  elements.dayProgressBar.style.width = `${(completedCount / SLOTS.length) * 100}%`;
  elements.dayProgressText.textContent = `今日 ${completedCount}/${SLOTS.length}`;

  document.querySelectorAll(".slot-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.slot === selectedSlot);
    const done = state.completedTasks[taskKey(selectedDay, button.dataset.slot)];
    button.textContent = done ? `${slotLabel(button.dataset.slot)} ✓` : slotLabel(button.dataset.slot);
  });

  elements.taskLists.innerHTML = "";
  taskLists.forEach((item) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `chip ${item.listId === activeList ? "is-current" : ""}`;
    chip.textContent = listLabel(item);
    chip.addEventListener("click", () => {
      activeList = item.listId;
      render();
    });
    elements.taskLists.append(chip);
  });

  elements.listSelect.value = String(activeList);
  renderWords();
}

function toggleCurrentTask() {
  const key = taskKey(selectedDay, selectedSlot);
  state.completedTasks[key] = !state.completedTasks[key];
  saveState();
  render();
}

function syncCompleteButtons(completed) {
  [elements.completeTask, elements.completeTaskBottom].forEach((button) => {
    button.textContent = completed ? "已完成" : "完成打卡";
    button.classList.toggle("is-done", completed);
  });
}

function renderWords() {
  const list = wordData.lists.find((item) => item.listId === activeList);
  const query = elements.searchInput.value.trim().toLowerCase();
  const status = elements.statusFilter.value;
  const words = list.words.filter((entry) => {
    const wordStatus = state.wordStatus[entry.id] || "new";
    const matchesStatus = status === "all" || status === wordStatus;
    const haystack = `${entry.word} ${entry.phonetic} ${entry.meaning} ${entry.example?.en || ""} ${entry.example?.zh || ""}`.toLowerCase();
    return matchesStatus && (!query || haystack.includes(query));
  });
  const counts = list.words.reduce(
    (acc, entry) => {
      acc[state.wordStatus[entry.id] || "new"] += 1;
      return acc;
    },
    { new: 0, familiar: 0, mastered: 0 },
  );

  elements.activeListMeta.textContent = `List ${String(activeList).padStart(2, "0")} · ${list.words.length} 词`;
  elements.activeListTitle.textContent = selectedSlot === "bedtime" ? "复习单词卡" : "单词卡";
  elements.wordStats.innerHTML = `
    <span class="stat">生词 ${counts.new}</span>
    <span class="stat">认识 ${counts.familiar}</span>
    <span class="stat">掌握 ${counts.mastered}</span>
    <span class="stat">当前显示 ${words.length}</span>
  `;
  elements.words.innerHTML = "";

  if (!words.length) {
    elements.words.innerHTML = '<div class="empty">没有符合筛选的单词。</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  words.forEach((entry) => fragment.append(wordCard(entry)));
  elements.words.append(fragment);
}

function wordCard(entry) {
  const status = state.wordStatus[entry.id] || "new";
  const card = document.createElement("article");
  card.className = `word-card is-${status}`;
  card.innerHTML = `
    <div class="word-top">
      <span class="word-index">${entry.index}</span>
      <div>
        <div class="word-line">
          <p class="word">${escapeHTML(entry.word)}</p>
          <div class="pronounce-actions" aria-label="${escapeHTML(entry.word)} 发音">
            <button class="pronounce-button" type="button" data-lang="en-GB" aria-label="播放英式读音">
              ${speakerIcon()}
              <span>UK</span>
            </button>
            <button class="pronounce-button" type="button" data-lang="en-US" aria-label="播放美式读音">
              ${speakerIcon()}
              <span>US</span>
            </button>
          </div>
        </div>
        <p class="phonetic">${escapeHTML(entry.phonetic)}</p>
      </div>
    </div>
    ${exampleBlock(entry)}
    <p class="memory-content meaning">${escapeHTML(entry.meaning)}</p>
    <div class="word-actions">
      <button type="button" data-status="new">生词</button>
      <button type="button" data-status="familiar">认识</button>
      <button type="button" data-status="mastered">掌握</button>
    </div>
  `;
  card.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    event.preventDefault();
    card.classList.add("is-peeking");
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
    card.addEventListener(eventName, () => card.classList.remove("is-peeking"));
  });
  card.querySelectorAll(".pronounce-button").forEach((button) => {
    button.disabled = !isSpeechSupported();
    button.title = isSpeechSupported() ? button.getAttribute("aria-label") : "当前浏览器不支持发音";
    button.addEventListener("click", () => {
      const text = button.dataset.example ? entry.example?.en : entry.word;
      speakText(text || entry.word, button.dataset.lang || "en-US");
    });
  });
  card.querySelectorAll(".word-actions button").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.status === status);
    button.addEventListener("click", () => {
      state.wordStatus[entry.id] = button.dataset.status;
      saveState();
      renderWords();
    });
  });
  return card;
}

function exampleBlock(entry) {
  if (!entry.example?.en || !entry.example?.zh) return "";
  return `
    <div class="example-block">
      <div class="example-head">
        <p class="example-label">托福学术例句</p>
        <button class="pronounce-button example-speak" type="button" data-example="true" aria-label="播放美式例句">
          ${speakerIcon()}
          <span>EX</span>
        </button>
      </div>
      <p class="example-en">${escapeHTML(entry.example.en)}</p>
      <p class="memory-content example-zh">${escapeHTML(entry.example.zh)}</p>
    </div>
  `;
}

function initSpeech() {
  if (!isSpeechSupported()) return;
  const loadVoices = () => {
    availableVoices = window.speechSynthesis.getVoices();
  };
  loadVoices();
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    loadVoices();
    if (wordData) renderWords();
  });
}

function isSpeechSupported() {
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function speakText(text, lang) {
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.9;
  const voice = voiceForLang(lang);
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

function voiceForLang(lang) {
  const voices = availableVoices.length ? availableVoices : window.speechSynthesis.getVoices();
  const normalized = lang.toLowerCase();
  const language = normalized.split("-")[0];
  return (
    voices.find((voice) => voice.lang.toLowerCase() === normalized) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith(language)) ||
    null
  );
}

function speakerIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 9v6h4l5 4V5L8 9H4z"></path>
      <path d="M16 8.5c1.2 1.1 1.8 2.2 1.8 3.5s-.6 2.4-1.8 3.5"></path>
      <path d="M18.6 6c1.8 1.7 2.7 3.7 2.7 6s-.9 4.3-2.7 6"></path>
    </svg>
  `;
}

function buildListOptions() {
  elements.listSelect.innerHTML = "";
  wordData.lists.forEach((item) => {
    const option = document.createElement("option");
    option.value = String(item.listId);
    option.textContent = item.title;
    elements.listSelect.append(option);
  });
}

function dayPlan(dayNumber) {
  return {
    dayNumber,
    newList: serialItem(dayNumber),
    bedtimeReviewLists: reviewSerials(dayNumber).map(serialItem),
  };
}

function reviewSerials(dayNumber) {
  return REVIEW_OFFSETS.map((offset) => dayNumber - offset)
    .filter((serial) => serial > 0)
    .sort((a, b) => a - b);
}

function serialItem(serial) {
  return { serial, listId: listForSerial(serial) };
}

function listForSerial(serial) {
  return ((serial - 1) % 30) + 1;
}

function listLabel(item) {
  const list = `List ${String(item.listId).padStart(2, "0")}`;
  return item.serial > 30 ? `${item.serial} → ${list}` : list;
}

function subtitleForPlan(plan) {
  const reviews = plan.bedtimeReviewLists.map(listLabel).join("、");
  return `前三段背 ${listLabel(plan.newList)}，睡前复习 ${reviews}。`;
}

function slotLabel(slotId) {
  return SLOTS.find((slot) => slot.id === slotId)?.label || slotId;
}

function currentSlot() {
  const hour = new Date().getHours();
  if (hour < 11) return "morning";
  if (hour < 16) return "noon";
  if (hour < 21) return "evening";
  return "bedtime";
}

function taskKey(day, slot) {
  return `${state.startDate}:day-${day}:${slot}`;
}

function dayFromStart(startDate) {
  const start = parseLocalDate(startDate);
  const today = parseLocalDate(todayISO());
  return clampDay(Math.floor((today - start) / 86400000) + 1);
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function todayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatToday() {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(new Date());
}

function clampDay(value) {
  return Math.max(1, Math.min(365, value));
}

function defaultState() {
  return {
    startDate: todayISO(),
    completedTasks: {},
    wordStatus: {},
  };
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY));
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    elements.offlineStatus.textContent = "当前浏览器不支持离线缓存";
    return;
  }
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("sw.js");
      elements.offlineStatus.textContent = registration.active ? "离线缓存已启用" : "离线缓存安装中";
    } catch {
      elements.offlineStatus.textContent = "用本地服务器打开后可启用离线缓存";
    }
  });
}
