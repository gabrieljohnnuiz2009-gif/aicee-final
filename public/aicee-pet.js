/* AIcee Buddy: lightweight, account-scoped pet growth for the student dashboard. */
(() => {
    "use strict";

    const STORAGE_PREFIX = "aicee_buddy_v1_";
    const XP_PER_PROGRESS_STEP = 5;
    const PROGRESS_STEP = 25;
    const DIAGNOSTIC_XP = 10;
    const GROWTH_STAGES = [
        { id: "spark", name: "Aurora Spark", min: 0, next: 25 },
        { id: "hatchling", name: "Hatchling", min: 25, next: 75 },
        { id: "companion", name: "Study Companion", min: 75, next: 75 }
    ];

    const defaultState = () => ({
        name: "Nova",
        xp: 0,
        moduleProgress: Object.create(null),
        diagnosticsCompleted: 0
    });

    let activeUserId = "";
    let state = defaultState();
    let card;
    let speech;
    let activeStage = "spark";
    let playResetTimer = 0;

    function getCard() {
        card = card || document.getElementById("aicee-pet-card");
        return card;
    }

    function storageKey(userId = activeUserId) {
        return userId ? `${STORAGE_PREFIX}${userId}` : "";
    }

    function saveState() {
        const key = storageKey();
        if (!key) return;
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch (error) {
            console.warn("AIcee Buddy progress could not be saved:", error);
        }
    }

    function loadState(userId) {
        const next = defaultState();
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey(userId)) || "null");
            if (saved && typeof saved === "object") {
                next.name = String(saved.name || next.name).trim().slice(0, 18) || next.name;
                next.xp = Math.max(0, Math.floor(Number(saved.xp) || 0));
                next.diagnosticsCompleted = Math.max(0, Math.floor(Number(saved.diagnosticsCompleted) || 0));
                if (saved.moduleProgress && typeof saved.moduleProgress === "object") {
                    for (const [moduleId, progress] of Object.entries(saved.moduleProgress)) {
                        next.moduleProgress[moduleId] = Math.max(0, Math.min(100, Number(progress) || 0));
                    }
                }
            }
        } catch (error) {
            console.warn("AIcee Buddy progress could not be read:", error);
        }
        return next;
    }

    function setSpeech(message) {
        speech = speech || document.getElementById("aicee-pet-speech");
        if (speech) speech.textContent = message;
    }

    function stageForXp(xp) {
        if (xp >= GROWTH_STAGES[2].min) return GROWTH_STAGES[2];
        if (xp >= GROWTH_STAGES[1].min) return GROWTH_STAGES[1];
        return GROWTH_STAGES[0];
    }

    function render({ grew = false } = {}) {
        const root = getCard();
        if (!root || !activeUserId) return;

        const stage = stageForXp(state.xp);
        const previousStage = activeStage;
        activeStage = stage.id;
        root.dataset.stage = stage.id;

        const name = document.getElementById("aicee-pet-name");
        const stageName = document.getElementById("aicee-pet-stage");
        const xpText = document.getElementById("aicee-pet-xp");
        const progress = document.getElementById("aicee-pet-progress");
        const progressBar = document.getElementById("aicee-pet-progress-bar");
        const stageCopy = document.getElementById("aicee-pet-copy");
        const character = document.getElementById("aicee-pet-character");
        const stageIndex = GROWTH_STAGES.indexOf(stage);

        if (name) name.textContent = state.name;
        if (stageName) stageName.textContent = stage.name;
        if (character) character.setAttribute("aria-label", `Greet ${state.name}, your ${stage.name.toLowerCase()}`);

        let percent = 100;
        let xpLabel = `${state.xp} total XP · fully grown`;
        if (stage.id !== "companion") {
            const span = stage.next - stage.min;
            const inStage = state.xp - stage.min;
            percent = Math.max(0, Math.min(100, (inStage / span) * 100));
            const nextStage = GROWTH_STAGES[GROWTH_STAGES.indexOf(stage) + 1];
            xpLabel = `${inStage} / ${span} XP to ${nextStage.name}`;
        }
        if (xpText) xpText.textContent = xpLabel;
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progress) {
            progress.setAttribute("aria-valuenow", String(Math.round(percent)));
            progress.setAttribute("aria-valuetext", xpLabel);
        }

        if (stageCopy) {
            stageCopy.textContent = stage.id === "spark"
                ? "A tiny aurora spark, curious and ready to learn."
                : stage.id === "hatchling"
                    ? "Your buddy is growing with every learning milestone."
                    : "Your study companion has reached full growth. Keep learning together.";
        }

        root.querySelectorAll(".pet-stage-steps span").forEach((step, index) => {
            step.classList.toggle("is-current", index === stageIndex);
            step.classList.toggle("is-complete", index < stageIndex);
        });

        if (grew || stage.id !== previousStage) {
            root.classList.remove("is-growing");
            void root.offsetWidth;
            root.classList.add("is-growing");
            window.setTimeout(() => root.classList.remove("is-growing"), 900);
        }
    }

    function setUser(user) {
        const root = getCard();
        const id = user && user.id != null ? String(user.id) : "";
        const role = String(user?.role || "").trim().toLowerCase();

        if (!root || !id || role !== "student") {
            activeUserId = "";
            state = defaultState();
            if (root) root.classList.add("hidden");
            return;
        }

        activeUserId = id;
        state = loadState(id);
        root.classList.remove("hidden");
        render();
    }

    function observeModuleProgress(moduleId, progress) {
        if (!activeUserId || moduleId == null) return;
        const key = String(moduleId);
        const observed = Math.max(0, Math.min(100, Number(progress) || 0));
        const saved = Object.prototype.hasOwnProperty.call(state.moduleProgress, key)
            ? Number(state.moduleProgress[key]) || 0
            : 0;
        if (observed > saved) {
            state.moduleProgress[key] = observed;
            saveState();
        }
    }

    function recordModuleProgress(moduleId, progress) {
        if (!activeUserId || moduleId == null) return;
        const key = String(moduleId);
        const before = Math.max(0, Math.min(100, Number(state.moduleProgress[key]) || 0));
        const after = Math.max(before, Math.min(100, Number(progress) || 0));
        if (after <= before) return;

        const crossed = Math.floor(after / PROGRESS_STEP) - Math.floor(before / PROGRESS_STEP);
        state.moduleProgress[key] = after;
        if (crossed > 0) {
            state.xp += crossed * XP_PER_PROGRESS_STEP;
            saveState();
            render();
            setSpeech(`Nice progress! ${state.name} earned ${crossed * XP_PER_PROGRESS_STEP} study XP.`);
        } else {
            saveState();
        }
    }

    function rewardDiagnostic() {
        if (!activeUserId) return;
        state.xp += DIAGNOSTIC_XP;
        state.diagnosticsCompleted += 1;
        saveState();
        render();
        setSpeech(`Diagnostic complete! ${state.name} earned ${DIAGNOSTIC_XP} study XP.`);
    }

    function greetBuddy() {
        const root = getCard();
        if (!root || !activeUserId) return;
        root.classList.remove("is-playing");
        void root.offsetWidth;
        root.classList.add("is-playing");
        window.clearTimeout(playResetTimer);
        playResetTimer = window.setTimeout(() => root.classList.remove("is-playing"), 1100);

        const lines = [
            `Hi, ${state.name}! Ready for a little learning adventure?`,
            `${state.name} is happy to see you.`,
            `Your buddy is cheering you on, ${state.name === "Nova" ? "friend" : "study buddy"}!`
        ];
        setSpeech(lines[Math.floor(Math.random() * lines.length)]);
    }

    function setupControls() {
        const greet = document.getElementById("aicee-pet-greet");
        const character = document.getElementById("aicee-pet-character");
        const renameToggle = document.getElementById("aicee-pet-rename-toggle");
        const renameForm = document.getElementById("aicee-pet-rename-form");
        const renameInput = document.getElementById("aicee-pet-rename-input");
        const renameCancel = document.getElementById("aicee-pet-rename-cancel");

        greet?.addEventListener("click", greetBuddy);
        character?.addEventListener("click", greetBuddy);
        renameToggle?.addEventListener("click", () => {
            if (!renameForm || !renameInput) return;
            renameForm.hidden = false;
            renameInput.value = state.name;
            renameInput.focus();
            renameInput.select();
        });
        renameCancel?.addEventListener("click", () => {
            if (renameForm) renameForm.hidden = true;
        });
        renameForm?.addEventListener("submit", event => {
            event.preventDefault();
            const nextName = String(renameInput?.value || "").trim().slice(0, 18);
            if (!nextName) {
                renameInput?.focus();
                return;
            }
            state.name = nextName;
            saveState();
            render();
            setSpeech(`You and ${state.name} make a great study team.`);
            renameForm.hidden = true;
        });
    }

    window.AiceePet = {
        setUser,
        observeModuleProgress,
        recordModuleProgress,
        rewardDiagnostic
    };

    document.addEventListener("DOMContentLoaded", () => {
        setupControls();
        try {
            const savedUser = JSON.parse(localStorage.getItem("user") || "null");
            if (savedUser) setUser(savedUser);
        } catch (error) {
            console.warn("AIcee Buddy session could not be read:", error);
        }
    });
})();
