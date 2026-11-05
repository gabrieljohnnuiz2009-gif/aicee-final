// EduVision AI - Main Script
let currentRole = 'student';
let currentConversationId = null;
let currentUser = {
    id: null,
    name: "",
    role: "",
    email: "",
    bio: "",
    section_name: "",
    created_at: null,
    diagnostic_completed: 0,
    must_change_password: 0
};

const AICEE_SETTINGS_KEY = "aicee_ui_settings";
const AICEE_TOKEN_KEY = "aicee_auth_token";
const AICEE_API_ORIGIN =
    ((window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") && window.location.port === "5500")
        ? "http://localhost:3000"
        : window.location.origin;

const nativeFetch = window.fetch.bind(window);
let authRedirectInProgress = false;

function clearAiceeSession() {
    localStorage.removeItem("user");
    localStorage.removeItem(AICEE_TOKEN_KEY);
}

function showSignedOutScreen(message) {
    if (authRedirectInProgress) return;

    authRedirectInProgress = true;
    clearAiceeSession();

    currentUser = {
        id: null,
        name: "",
        role: "",
        email: "",
        bio: "",
        section_name: "",
        created_at: null,
        diagnostic_completed: 0,
        must_change_password: 0
    };

    const mainApp = document.getElementById("main-app");
    const loginPage = document.getElementById("login-page");
    const errorBox = document.getElementById("login-error");

    if (mainApp) mainApp.classList.add("hidden");
    if (loginPage) loginPage.classList.remove("hidden");

    if (errorBox) {
        errorBox.textContent =
            message ||
            "Your session expired. Please sign in again.";
    }

    setTimeout(() => {
        authRedirectInProgress = false;
    }, 500);
}

window.fetch = async function aiceeAuthenticatedFetch(
    input,
    init = {}
) {
    const requestUrl =
        typeof input === "string"
            ? input
            : input.url;

    const isAiceeApi =
        String(requestUrl).startsWith("/") ||
        String(requestUrl).startsWith(AICEE_API_ORIGIN);

    const headers = new Headers(
        init.headers ||
        (
            typeof Request !== "undefined" &&
            input instanceof Request
                ? input.headers
                : undefined
        )
    );

    const token = localStorage.getItem(
        AICEE_TOKEN_KEY
    );

    if (isAiceeApi && token) {
        headers.set(
            "Authorization",
            `Bearer ${token}`
        );
    }

    const resolvedInput =
        typeof input === "string" && input.startsWith("/")
            ? `${AICEE_API_ORIGIN}${input}`
            : input;

    const response = await nativeFetch(
        resolvedInput,
        {
            ...init,
            headers
        }
    );

    const isPublicAuthRequest =
        String(requestUrl).endsWith("/login") ||
        String(requestUrl).endsWith("/forgot-password");

    if (
        isAiceeApi &&
        response.status === 401 &&
        !isPublicAuthRequest
    ) {
        let message =
            "Your session expired. Please sign in again.";

        let code = "";

        try {
            const cloned = response.clone();
            const data = await cloned.json();
            message = data.message || message;
            code = String(data.code || "");
        } catch (error) {
            // Keep the default message when the response is not JSON.
        }

        const sessionCodes = new Set([
            "AUTH_REQUIRED",
            "SESSION_EXPIRED",
            "SESSION_REVOKED",
            "INVALID_TOKEN",
            "ACCOUNT_NOT_FOUND"
        ]);

        if (sessionCodes.has(code)) {
            showSignedOutScreen(message);
        }
    }

    return response;
};

const defaultAiceeSettings = {
    theme: "system",
    accent: "blue",
    animations: true,
    compact: false,
    loginAnimation: true
};

let aiceeSettings = {
    ...defaultAiceeSettings
};

// Dynamic data loaded from the database
let sampleModules = [];
let recentGrades = [];
let assignmentsList = [];
let fullGradesList = [];


// =====================================================
// AICEE LEARNING PROFILE
// =====================================================
let latestDiagnosticResults = [];
let diagnosticHistory = [];
let diagnosticStatus = {
    has_completed: false,
    can_take: true,
    last_taken_at: null,
    next_available_at: null
};

/*
    Secure token for the exact diagnostic
    question set assigned to the student.
*/
let currentDiagnosticSetToken = "";
let aiLearningMaterials = [];

console.log("✅ EduVision app.js loaded");


function getLetterGrade(score) {

    const numericScore = Number(score);

    if (numericScore >= 90) return "A";
    if (numericScore >= 85) return "B+";
    if (numericScore >= 80) return "B";
    if (numericScore >= 75) return "C";

    return "F";

}

function populateRecentGrades() {
    const tbody = document.getElementById('recent-grades-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    recentGrades.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = "border-b last:border-none hover:bg-gray-50 transition-colors";
        tr.innerHTML = `
            <td class="py-4">${row[0]}</td>
            <td class="py-4">${row[1]}</td>
            <td class="py-4 text-center font-medium ${parseInt(row[2]) > 85 ? 'text-emerald-600' : 'text-amber-600'}">${row[2]}</td>
            <td class="py-4 text-gray-500">${row[3]}</td>
        `;
        tbody.appendChild(tr);
    });
}

function populateUpcoming(assignments = []) {

    const container =
        document.getElementById(
            "upcoming-deadlines"
        );

    if (!container) return;

    const upcomingAssignments =
        assignments
            .filter(assignment => {

                if (!assignment.due_date) {
                    return false;
                }

                const dueDate =
                    new Date(
                        assignment.due_date
                    );

                return (
                    !Number.isNaN(
                        dueDate.getTime()
                    ) &&
                    dueDate >= new Date()
                );

            })
            .sort(
                (a, b) =>
                    new Date(a.due_date) -
                    new Date(b.due_date)
            )
            .slice(0, 4);

    if (
        upcomingAssignments.length === 0
    ) {

        container.innerHTML = `
            <div class="bg-gray-50 rounded-2xl p-6 text-center">

                <div class="text-3xl mb-3">
                    🎉
                </div>

                <p class="font-medium text-gray-700">
                    No upcoming deadlines
                </p>

                <p class="text-xs text-gray-500 mt-1">
                    You're all caught up for now.
                </p>

            </div>
        `;

        return;

    }

    container.innerHTML =
        upcomingAssignments
            .map(assignment => {

                const dueDate =
                    new Date(
                        assignment.due_date
                    );

                const difference =
                    dueDate.getTime() -
                    new Date().getTime();

                const daysLeft =
                    Math.ceil(
                        difference /
                        (
                            1000 *
                            60 *
                            60 *
                            24
                        )
                    );

                let deadlineLabel;

                if (daysLeft <= 0) {
                    deadlineLabel =
                        "Due today";
                } else if (daysLeft === 1) {
                    deadlineLabel =
                        "1d left";
                } else {
                    deadlineLabel =
                        `${daysLeft}d`;
                }

                const formattedDate =
                    dueDate.toLocaleString(
                        "en-PH",
                        {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit"
                        }
                    );

                const relatedSubject =
                    assignment.module_title
                        ? assignment.module_title
                        : "General Assignment";

                return `
                    <div class="flex gap-4 items-center bg-gray-50 p-4 rounded-2xl">

                        <div class="w-10 h-10 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center text-xl shrink-0">

                            <i class="fa-solid fa-file-pen"></i>

                        </div>

                        <div class="flex-1 min-w-0">

                            <div class="font-medium truncate">
                                ${escapeHTML(
                                    assignment.title
                                )}
                            </div>

                            <div class="text-xs text-gray-500">

                                ${escapeHTML(
                                    relatedSubject
                                )}

                                • Due ${formattedDate}

                            </div>

                        </div>

                        <div class="text-xs bg-white px-3 py-1 rounded-xl text-blue-600 font-medium whitespace-nowrap">

                            ${deadlineLabel}

                        </div>

                    </div>
                `;

            })
            .join("");

}

async function loadUpcomingDeadlines() {

    if (currentRole !== "student") {
        return;
    }

    const container =
        document.getElementById(
            "upcoming-deadlines"
        );

    if (container) {

        container.innerHTML = `
            <div class="bg-gray-50 rounded-2xl p-5 text-sm text-gray-500">
                Loading deadlines...
            </div>
        `;

    }

    try {

        const response = await fetch(
            `/assignments/student/${currentUser.id}`
        );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Failed to load deadlines."
            );

        }

        populateUpcoming(
            data.assignments || []
        );

    } catch (error) {

        console.error(
            "Upcoming deadlines error:",
            error
        );

        if (container) {

            container.innerHTML = `
                <div class="bg-red-50 text-red-600 rounded-2xl p-5 text-sm">
                    Failed to load deadlines.
                </div>
            `;

        }

    }

}

function populateAssignments() {

    const container =
        document.getElementById(
            "assignments-list"
        );

    if (!container) return;

    container.innerHTML = "";

    if (
        !Array.isArray(assignmentsList) ||
        assignmentsList.length === 0
    ) {

        container.innerHTML = `
            <div class="bg-white border border-gray-100 rounded-3xl p-10 text-center">

                <div class="text-5xl mb-4">
                    📝
                </div>

                <h3 class="text-lg font-semibold text-gray-800">
                    No assignments yet
                </h3>

                <p class="text-sm text-gray-500 mt-2">
                    ${
                        currentRole === "teacher"
                            ? "Create an assignment for your sections."
                            : "Your teacher has not assigned any tasks yet."
                    }
                </p>

            </div>
        `;

        return;

    }

    assignmentsList.forEach(
        assignment => {

            const div =
                document.createElement("div");

            div.className =
                "bg-white border border-gray-100 rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5 card-hover";

            const dueDate =
                formatAssignmentDate(
                    assignment.due_date
                );

            const isOverdue =
                assignment.due_date &&
                new Date(assignment.due_date) <
                    new Date();

            const statusText =
                isOverdue
                    ? "Overdue"
                    : assignment.status || "Pending";

            const statusClass =
                isOverdue
                    ? "bg-red-100 text-red-600"
                    : "bg-amber-100 text-amber-600";

            const teacherDetails =
                currentRole === "student"
                    ? `
                        <p class="text-xs text-gray-500 mt-1">
                            Teacher:
                            ${assignment.teacher_name || "—"}
                        </p>
                    `
                    : `
                        <p class="text-xs text-gray-500 mt-1">
                            Sections:
                            ${assignment.assigned_sections || "—"}
                        </p>
                    `;

            div.innerHTML = `

                <div class="flex items-start gap-4">

                    <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-xl shrink-0">

                        <i class="fa-solid fa-file-pen"></i>

                    </div>

                    <div>

                        <h3 class="font-semibold text-lg text-gray-900">
                            ${escapeHTML(
                                assignment.title
                            )}
                        </h3>

                        <p class="text-sm text-gray-600 mt-1">
                            ${
                                escapeHTML(
                                    assignment.description ||
                                    "No description provided."
                                )
                            }
                        </p>

                        <p class="text-xs text-gray-500 mt-2">

                            ${
                                assignment.module_title
                                    ? `Module: ${escapeHTML(
                                        assignment.module_title
                                    )} • `
                                    : ""
                            }

                            Due: ${dueDate}

                        </p>

                        ${teacherDetails}

                    </div>

                </div>

                <div class="flex items-center gap-3">

                    <span class="px-4 py-1.5 rounded-full text-xs font-semibold ${statusClass}">
                        ${statusText}
                    </span>

                    <button
                        type="button"
                        onclick="viewAssignment(${assignment.id})"
                        class="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-xs rounded-xl font-medium"
                    >
                        View Task
                    </button>

                </div>

            `;

            container.appendChild(div);

        }
    );

}

function populateFullGrades() {

    const tbody =
        document.getElementById(
            "full-grades-tbody"
        );

    if (!tbody) return;

    tbody.innerHTML = "";

    if (
        !Array.isArray(fullGradesList) ||
        fullGradesList.length === 0
    ) {

        tbody.innerHTML = `
            <tr>
                <td
                    colspan="5"
                    class="py-10 text-center text-gray-500"
                >
                    No grades available yet.
                </td>
            </tr>
        `;

        return;
    }

    fullGradesList.forEach(item => {

        const tr =
            document.createElement("tr");

        tr.className =
            "border-b last:border-none hover:bg-gray-50 transition-colors";

        const numericScore =
            parseFloat(item.score) || 0;

        const scoreColor =
            numericScore >= 85
                ? "text-emerald-600"
                : numericScore >= 75
                    ? "text-amber-600"
                    : "text-red-600";

        const statusClass =
            numericScore >= 75
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-700";

        tr.innerHTML = `
            <td class="py-4 font-semibold text-gray-800">
                ${item.subject}

                <span class="text-xs font-normal text-gray-400">
                    (${item.code || "—"})
                </span>
            </td>

            <td class="py-4 text-gray-600">
                ${item.instructor || "—"}
            </td>

            <td class="py-4 font-bold ${scoreColor}">
                ${item.score}
            </td>

            <td class="py-4 font-semibold text-gray-700">
                ${item.grade}
            </td>

            <td class="py-4">
                <span class="px-3 py-1 rounded-full text-xs font-medium ${statusClass}">
                    ${item.status}
                </span>
            </td>
        `;

        tbody.appendChild(tr);

    });

}
function getInitials(name) {
    return String(name || "A")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part.charAt(0).toUpperCase())
        .join("") || "A";
}

function formatMemberSince(value) {
    if (!value) return "Not available";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Not available";
    }

    return date.toLocaleDateString("en-PH", {
        month: "long",
        year: "numeric"
    });
}

function updateProfileBioCount() {
    const input = document.getElementById("edit-bio");
    const counter = document.getElementById("profile-bio-count");

    if (input && counter) {
        counter.textContent = `${input.value.length} / 240`;
    }
}

function updateIdentitySurfaces() {
    const initials = getInitials(currentUser.name);

    const profileAvatar = document.getElementById("profile-avatar-initials");
    const headerAvatar = document.getElementById("header-avatar-initials");
    const headerName = document.getElementById("header-name");
    const userName = document.getElementById("user-name");

    if (profileAvatar) profileAvatar.textContent = initials;
    if (headerAvatar) headerAvatar.textContent = initials;
    if (headerName) headerName.textContent = currentUser.name || "AICEE User";
    if (userName) userName.textContent = currentUser.name || "AICEE User";
}

function populateProfile() {
    const profileName = document.getElementById("profile-name");
    const profileRole = document.getElementById("profile-role");
    const profileRoleBadge = document.getElementById("profile-role-badge");
    const profileEmail = document.getElementById("profile-email");
    const profileSection = document.getElementById("profile-section");
    const profileBioPreview = document.getElementById("profile-bio-preview");
    const profileAccountId = document.getElementById("profile-account-id");
    const profileMemberSince = document.getElementById("profile-member-since");

    const editName = document.getElementById("edit-name");
    const editEmail = document.getElementById("edit-email");
    const editBio = document.getElementById("edit-bio");

    const role = String(currentUser.role || "student");
    const formattedRole = role.charAt(0).toUpperCase() + role.slice(1);

    const aiPrivacyNote = document.getElementById("profile-ai-privacy-note");
    const profileEditorTitle = document.getElementById("profile-editor-title");
    const profileEditorDescription = document.getElementById("profile-editor-description");

    if (aiPrivacyNote) {
        aiPrivacyNote.classList.toggle("hidden", role !== "student");
    }

    if (profileEditorTitle) {
        profileEditorTitle.textContent = role === "student"
            ? "Help AIcee understand you"
            : "Edit your profile";
    }

    if (profileEditorDescription) {
        profileEditorDescription.textContent = role === "student"
            ? "Your name, section, and learning note help AIcee personalize guidance. This is not a social profile."
            : "Keep your account information accurate and up to date.";
    }

    if (profileName) profileName.textContent = currentUser.name || "No name";
    if (profileRole) profileRole.textContent = formattedRole;
    if (profileRoleBadge) profileRoleBadge.textContent = formattedRole;
    if (profileEmail) profileEmail.textContent = currentUser.email || "No email";
    if (profileSection) {
        profileSection.textContent = currentUser.section_name ||
            (role === "teacher" ? "Teacher account" : "No section assigned");
    }
    if (profileBioPreview) {
        profileBioPreview.textContent = currentUser.bio ||
            "Add a short bio so your profile feels more personal.";
    }
    if (profileAccountId) profileAccountId.textContent = currentUser.id ? `#${currentUser.id}` : "—";
    if (profileMemberSince) profileMemberSince.textContent = formatMemberSince(currentUser.created_at);

    if (editName) editName.value = currentUser.name || "";
    if (editEmail) editEmail.value = currentUser.email || "";
    if (editBio) editBio.value = currentUser.bio || "";

    const completedFields = [
        Boolean(String(currentUser.name || "").trim()),
        Boolean(String(currentUser.email || "").trim()),
        Boolean(String(currentUser.bio || "").trim()),
        Boolean(String(currentUser.section_name || "").trim()) || role === "teacher"
    ];

    const completion = Math.round(
        (completedFields.filter(Boolean).length / completedFields.length) * 100
    );

    const completionValue = document.getElementById("profile-completion-value");
    const completionRingText = document.getElementById("profile-progress-ring-text");
    const completionRing = document.getElementById("profile-progress-ring");
    const completionBar = document.getElementById("profile-completion-bar");
    const completionMessage = document.getElementById("profile-completion-message");

    if (completionValue) completionValue.textContent = completion;
    if (completionRingText) completionRingText.textContent = `${completion}%`;
    if (completionRing) completionRing.style.setProperty("--profile-progress", `${completion * 3.6}deg`);
    if (completionBar) completionBar.style.width = `${completion}%`;
    if (completionMessage) {
        completionMessage.textContent = completion === 100
            ? "Your profile is complete and ready to represent you across AICEE."
            : "Add your bio and complete the missing account details to finish your profile.";
    }

    updateProfileBioCount();
    updateIdentitySurfaces();
}

async function loadProfile() {
    try {
        const response = await fetch(
            `/profile/${currentUser.id}`
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Profile failed to load.");
        }

        currentUser.id = data.user.id;
        currentUser.name = data.user.name || "";
        currentUser.email = data.user.email || "";
        currentUser.role = String(data.user.role || "student").toLowerCase();
        currentUser.bio = data.user.bio || "";
        currentUser.section_name = data.user.section_name || "";
        currentUser.created_at = data.user.created_at || null;

        localStorage.setItem("user", JSON.stringify(currentUser));
        populateProfile();
    } catch (error) {
        console.error("Load profile error:", error);

        const status = document.getElementById("profile-save-status");
        if (status) {
            status.className = "text-sm text-red-600 min-h-[20px]";
            status.textContent = error.message;
        }
    }
}

async function updateProfile(event) {
    if (event) event.preventDefault();

    const inputName = document.getElementById("edit-name");
    const inputEmail = document.getElementById("edit-email");
    const inputBio = document.getElementById("edit-bio");
    const saveButton = document.getElementById("profile-save-button");
    const status = document.getElementById("profile-save-status");

    const name = inputName?.value.trim() || "";
    const email = inputEmail?.value.trim() || "";
    const bio = inputBio?.value.trim() || "";

    if (!name || !email) {
        if (status) {
            status.className = "text-sm text-red-600 min-h-[20px]";
            status.textContent = "Name and email are required.";
        }
        return;
    }

    try {
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.innerHTML = `<span class="flex items-center justify-center gap-2"><span class="aicee-spinner"></span>Saving...</span>`;
        }

        if (status) {
            status.className = "text-sm text-blue-600 min-h-[20px]";
            status.textContent = "Saving your changes...";
        }

        const response = await fetch(
            `/profile/${currentUser.id}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, bio })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Failed to update profile.");
        }

        currentUser.name = name;
        currentUser.email = email;
        currentUser.bio = bio;

        await loadProfile();

        if (status) {
            status.className = "text-sm text-emerald-600 min-h-[20px]";
            status.textContent = "Profile saved successfully.";
        }

        showMessagePopup(
            "Profile Updated",
            "Your profile information has been saved successfully.",
            "success"
        );
    } catch (error) {
        console.error("Update profile error:", error);

        if (status) {
            status.className = "text-sm text-red-600 min-h-[20px]";
            status.textContent = error.message;
        }
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerHTML = `<span class="flex items-center justify-center gap-2"><i class="fa-regular fa-floppy-disk"></i>Save changes</span>`;
        }
    }
}


function createSidebar(role) {
    const studentNav = document.getElementById('nav-student');
    const teacherNav = document.getElementById('nav-teacher');
    const adminNav = document.getElementById('nav-admin');
    
    if (studentNav) {
        studentNav.innerHTML = `
            <a onclick="navigateTo('dashboard')" class="sidebar-link flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-100">
                <i class="fa-solid fa-house w-5"></i>
                <span class="font-medium">Dashboard</span>
            </a>

            <a onclick="openAIAssistant()" class="sidebar-link flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-100">
                <i class="fa-solid fa-robot w-5"></i>
                <span class="font-medium">AIcee Study Assistant</span>
            </a>

            <a onclick="navigateTo('profile')" class="sidebar-link flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-100">
                <i class="fa-solid fa-brain w-5"></i>
                <span class="font-medium">My Learning Profile</span>
            </a>

            <a onclick="openDiagnosticQuiz()" class="sidebar-link flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-100">
                <i class="fa-solid fa-clipboard-question w-5"></i>
                <span class="font-medium">Diagnostic Assessment</span>
            </a>

            <a onclick="navigateTo('settings')" class="sidebar-link flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-100">
                <i class="fa-solid fa-sliders w-5"></i>
                <span class="font-medium">Settings</span>
            </a>
        `;
    }
    if (teacherNav) {
        teacherNav.innerHTML = `
            <a onclick="navigateTo('dashboard')" class="sidebar-link flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-100"><i class="fa-solid fa-house w-5"></i><span class="font-medium">Dashboard</span></a>
            <a onclick="navigateTo('students')" class="sidebar-link flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-100"><i class="fa-solid fa-users w-5"></i><span class="font-medium">Student Learning Profiles</span></a>
            <a onclick="navigateTo('modules')" class="sidebar-link flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-100"><i class="fa-solid fa-book-open w-5"></i><span class="font-medium">Learning Materials</span></a>
            <a onclick="navigateTo('profile')" class="sidebar-link flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-100"><i class="fa-solid fa-user w-5"></i><span class="font-medium">Profile</span></a>
            <a onclick="navigateTo('settings')" class="sidebar-link flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-100"><i class="fa-solid fa-sliders w-5"></i><span class="font-medium">Settings</span></a>
        `;
    }

    if (adminNav) {
        adminNav.innerHTML = `
            <a onclick="navigateTo('dashboard')" class="sidebar-link flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-100">
                <i class="fa-solid fa-gauge-high w-5"></i>
                <span class="font-medium">System Dashboard</span>
            </a>
            <a onclick="navigateTo('admin-accounts')" class="sidebar-link flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-100">
                <i class="fa-solid fa-users-gear w-5"></i>
                <span class="font-medium">Account Management</span>
            </a>
            <a onclick="navigateTo('admin-sections')" class="sidebar-link flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-100">
                <i class="fa-solid fa-school w-5"></i>
                <span class="font-medium">Sections</span>
            </a>
            <a onclick="navigateTo('admin-data-sources')" class="sidebar-link flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-100">
                <i class="fa-solid fa-diagram-project w-5"></i>
                <span class="font-medium">Data Sources</span>
            </a>
            <a onclick="navigateTo('profile')" class="sidebar-link flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-100">
                <i class="fa-solid fa-user-shield w-5"></i>
                <span class="font-medium">My Admin Profile</span>
            </a>
            <a onclick="navigateTo('settings')" class="sidebar-link flex items-center gap-3 px-5 py-3 text-gray-700 hover:bg-gray-100">
                <i class="fa-solid fa-sliders w-5"></i>
                <span class="font-medium">Settings</span>
            </a>
        `;
    }

    enhanceInteractiveElements();
}

function switchRole(role) {

    const normalizedRole = String(role || "student")
        .trim()
        .toLowerCase();

    currentRole = normalizedRole;
    currentUser.role = normalizedRole;

    ["student", "teacher", "admin"].forEach(navRole => {
        const navElement = document.getElementById(`nav-${navRole}`);

        if (navElement) {
            navElement.classList.add("hidden");
        }
    });

    const activeNav = document.getElementById(`nav-${normalizedRole}`);

    if (activeNav) {
        activeNav.classList.remove("hidden");
    }

    const badge = document.getElementById("role-badge");

    if (badge) {
        badge.textContent = normalizedRole.toUpperCase();
    }

    updateIdentitySurfaces();
    setActiveSidebarPage("dashboard");
    hideAllDashboards();

    if (normalizedRole === "student") {
        const dashboard = document.getElementById("student-dashboard");

        if (dashboard) {
            dashboard.classList.remove("hidden");
        }
    } else if (normalizedRole === "teacher") {
        const dashboard = document.getElementById("teacher-dashboard");

        if (dashboard) {
            dashboard.classList.remove("hidden");
        }

        populateTeacherContent();

    } else {
        const dashboard = document.getElementById("admin-dashboard");

        if (dashboard) {
            dashboard.classList.remove("hidden");
        }

        loadAdminOverview();
    }

    const displayRole =
        normalizedRole.charAt(0).toUpperCase() +
        normalizedRole.slice(1);

    const headerName = document.getElementById("header-name");
    const headerRole = document.getElementById("header-role");
    const userNameElement = document.getElementById("user-name");

    if (headerName) {
        headerName.textContent = currentUser.name
            ? currentUser.name.split(" ")[0]
            : "";
    }

    if (headerRole) {
        headerRole.textContent = displayRole;
    }

    if (userNameElement) {
        userNameElement.textContent = currentUser.name || "";
    }

    const uploadButton = document.getElementById("upload-button");
    const newAssignmentButton =
        document.getElementById("new-assignment-button");
    const uploadModal = document.getElementById("upload-modal");

    const isTeacher = normalizedRole === "teacher";

    // Teacher keeps the Learning Materials workspace and upload feature.
    // Students do not get a separate Modules page; they can use assigned PDFs inside AIcee.
    if (uploadButton) {
        uploadButton.style.display = isTeacher ? "" : "none";
    }

    if (newAssignmentButton) {
        newAssignmentButton.style.display = "none";
    }

    if (!isTeacher && uploadModal) {
        uploadModal.classList.add("hidden");
    }

    if (
        normalizedRole === "student" ||
        normalizedRole === "teacher"
    ) {
        loadNotifications();
    }
}

function hideAllDashboards() {
    const views = [
        'student-dashboard',
        'teacher-dashboard',
        'admin-dashboard',
        'modules-view',
        'assignments-view',
        'grades-view',
        'profile-view',
        'settings-view',
        'students-view',
        'submissions-view',
        'gradebook-view',
        'teacher-ai-insights-view',
        'teacher-context-view',
        'admin-accounts-view',
        'admin-sections-view',
        'admin-data-sources-view',
    ];

    views.forEach(id => {
        const el = document.getElementById(id);

        if (el) {
            el.classList.add('hidden');
        }
    });
}

function populateModules() {

    if(currentRole === "teacher"){

        populateTeacherModules();

    }else{

        populateStudentModules();

    }

}


function populateTeacherModules(){

    const container = document.getElementById('modules-grid');

    if(!container) return;

    container.innerHTML = "";


    sampleModules.forEach(mod=>{


        container.innerHTML += `

        <div class="bg-white border border-gray-100 rounded-3xl p-6 card-hover">

            <div class="text-4xl mb-6">
                ${mod.icon}
            </div>


            <div class="font-semibold text-lg">
                ${mod.title}
            </div>


            <div class="text-xs uppercase text-gray-400">
                ${mod.type}
            </div>


            <div class="grid grid-cols-3 gap-2 mt-8">


                <button 
                onclick="viewModule('${mod.file}')"
                class="bg-blue-600 text-white rounded-xl py-2 text-sm">

                View

                </button>


                <button
                onclick="editModule(${mod.id})"
                class="bg-yellow-500 text-white rounded-xl py-2 text-sm">

                Edit

                </button>


                <button
                onclick="deleteModule(${mod.id})"
                class="bg-red-600 text-white rounded-xl py-2 text-sm">

                Delete

                </button>


            </div>


        </div>

        `;


    });


}

async function editModule(id) {

    const module = sampleModules.find(
        item => Number(item.id) === Number(id)
    );

    if (!module) {
        showMessagePopup(
            "Module Not Found",
            "The selected module could not be found.",
            "error"
        );
        return;
    }

    const newTitle = await showPromptPopup({
        title: "Edit Module Title",
        message:
            "Enter the updated title for this module.",
        defaultValue: module.title,
        confirmText: "Continue",
        required: true
    });

    if (newTitle === null) {
        return;
    }

    const newDescription = await showPromptPopup({
        title: "Edit Module Description",
        message:
            "Update the module description, or leave it blank.",
        defaultValue:
            module.description || "",
        confirmText: "Save Changes",
        multiline: true,
        required: false
    });

    if (newDescription === null) {
        return;
    }

    try {

        const response = await fetch(
            `/module/${id}`,
            {
                method: "PUT",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    title: newTitle.trim(),
                    description: newDescription.trim(),
                    teacher_id: currentUser.id
                })
            }
        );

        const data = await response.json();

        console.log("Edit response:", data);

        if (!response.ok || !data.success) {

            showMessagePopup(
                "Update Failed",
                data.message || "Module update failed.",
                "error"
            );

            return;
        }

        showMessagePopup(
            "Module Updated",
            "The module was updated successfully.",
            "success"
        );

        await loadDashboard();

        populateModules();

    } catch (error) {

        console.error("Edit module error:", error);

        showMessagePopup(
            "Connection Error",
            "Cannot connect to the server.",
            "error"
        );

    }

}


async function deleteModule(id) {

    if (currentRole !== "teacher") {
        showMessagePopup(
            "Access Denied",
            "Only teacher accounts can delete modules.",
            "error"
        );
        return;
    }

    const module = sampleModules.find(
        item => Number(item.id) === Number(id)
    );

    if (!module) {
        showMessagePopup(
            "Module Not Found",
            "The selected module is no longer available. Please refresh the page.",
            "error"
        );
        return;
    }

    const confirmed = await showConfirmPopup({
        title: "Delete Module?",
        message:
            `Are you sure you want to permanently delete “${module.title}”?\n\n` +
            "Its section assignments, old module grades, and student progress records will be removed. Existing assignments will remain, but they will no longer be linked to this module.",
        confirmText: "Delete Module",
        cancelText: "Cancel",
        type: "delete"
    });

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(
            `/module/${encodeURIComponent(id)}` +
            `?teacher_id=${encodeURIComponent(currentUser.id)}`,
            {
                method: "DELETE"
            }
        );

        let data = {};

        try {
            data = await response.json();
        } catch (parseError) {
            console.error(
                "Delete module response parse error:",
                parseError
            );
        }

        if (!response.ok || !data.success) {
            throw new Error(
                data.message ||
                "Module deletion failed."
            );
        }

        sampleModules = sampleModules.filter(
            item => Number(item.id) !== Number(id)
        );

        populateModules();

        await loadDashboard();
        populateModules();

        if (currentRole === "teacher") {
            await populateTeacherContent();
        }

        showMessagePopup(
            "Module Deleted",
            data.message ||
                `“${module.title}” was deleted successfully.`,
            "success"
        );

    } catch (error) {
        console.error(
            "Delete module error:",
            error
        );

        showMessagePopup(
            "Delete Failed",
            error.message ||
                "The module could not be deleted. Please try again.",
            "error"
        );
    }
}

function populateStudentModules() {
    const container = document.getElementById('modules-grid');
    if (!container) return;
    container.innerHTML = '';
    
    sampleModules.forEach(mod => {
        const div = document.createElement('div');
        div.className = "bg-white border border-gray-100 rounded-3xl p-6 card-hover";
        div.innerHTML = `
            <div class="text-4xl mb-6">${mod.icon}</div>
            <div class="font-semibold text-lg leading-tight mb-1">${mod.title}</div>
            <div class="text-xs uppercase tracking-widest text-gray-400">${mod.type}</div>
            
            <div class="mt-8">
                <div class="flex justify-between text-xs mb-2">
                    <span class="text-gray-500">Progress</span>
                    <span class="font-medium">${mod.progress}%</span>
                </div>
                <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div class="h-2 bg-blue-600 rounded-full" style="width: ${mod.progress}%"></div>
                </div>
            </div>
            
            <div class="grid grid-cols-2 gap-3 mt-8">

    <button
        onclick="openStudentModule('${mod.file}', ${mod.id}, ${mod.progress})"
        class="w-full py-3 text-sm border border-gray-200 hover:bg-gray-50 rounded-2xl">

        Continue Learning

    </button>

    <button
        onclick="completeModule(${mod.id})"
        class="w-full py-3 text-sm bg-emerald-600 text-white hover:bg-emerald-700 rounded-2xl">

        Mark Complete

    </button>

</div>
        `;
        container.appendChild(div);
    });
}

let latestTeacherDashboardData = {
    stats: {},
    section_performance: [],
    at_risk_students: []
};

async function populateTeacherContent() {
    const totalStudents=document.getElementById("teacher-total-students");
    const diagnosticCompleted=document.getElementById("teacher-diagnostic-completed");
    const aiProfilesReady=document.getElementById("teacher-ai-profiles-ready");
    [totalStudents,diagnosticCompleted,aiProfilesReady].filter(Boolean).forEach(el=>el.textContent="…");
    try{
        const response=await fetch(`/teacher-students/${currentUser.id}`);
        const data=await response.json();
        if(!response.ok||!data.success) throw new Error(data.message||"Failed to load students.");
        managedStudents=Array.isArray(data.students)?data.students:[];
        const ready=managedStudents.filter(student=>Number(student.diagnostic_completed)===1).length;
        if(totalStudents) totalStudents.textContent=managedStudents.length;
        if(diagnosticCompleted) diagnosticCompleted.textContent=ready;
        if(aiProfilesReady) aiProfilesReady.textContent=ready;
        latestTeacherDashboardData={stats:{total_students:managedStudents.length},section_performance:[],at_risk_students:[]};
    }catch(error){
        console.error("Teacher dashboard error:",error);
        [totalStudents,diagnosticCompleted,aiProfilesReady].filter(Boolean).forEach(el=>el.textContent="—");
    }
}


function renderAtRiskStudents(students) {

    const container =
        document.getElementById(
            "at-risk-students"
        );

    if (!container) return;

    if (
        !Array.isArray(students) ||
        students.length === 0
    ) {

        container.innerHTML = `
            <div class="py-8 text-center">

                <div class="text-4xl mb-3">
                    ✅
                </div>

                <p class="text-sm font-medium text-gray-700">
                    No students at risk
                </p>

                <p class="text-xs text-gray-500 mt-1">
                    Students below 75% will appear here.
                </p>

            </div>
        `;

        return;

    }

    container.innerHTML =
        students
            .map(student => {

                const grade =
                    Number(
                        student.average_grade
                    ) || 0;

                return `
                    <div class="flex items-center justify-between gap-4 border-b border-gray-100 pb-4 last:border-none">

                        <div class="min-w-0">

                            <div class="font-semibold text-gray-900 truncate">
                                ${escapeHTML(
                                    student.student_name
                                )}
                            </div>

                            <div class="text-xs text-gray-500 mt-1">
                                ${escapeHTML(
                                    student.section_name
                                )}
                                • ${grade}% average
                            </div>

                        </div>

                        <button
                            type="button"
                            onclick="navigateTo('students')"
                            class="shrink-0 text-xs bg-rose-100 hover:bg-rose-200 text-rose-600 px-4 py-2 rounded-2xl font-medium"
                        >
                            View Student
                        </button>

                    </div>
                `;

            })
            .join("");

}


function renderTeacherPerformanceChart(
    sectionPerformance
) {

    const canvas =
        document.getElementById(
            "classPerfChart"
        );

    if (
        !canvas ||
        typeof Chart === "undefined"
    ) {
        return;
    }

    let emptyMessage =
        document.getElementById(
            "class-performance-empty"
        );

    if (!emptyMessage) {

        emptyMessage =
            document.createElement("div");

        emptyMessage.id =
            "class-performance-empty";

        emptyMessage.className =
            "hidden py-10 text-center text-sm text-gray-500";

        canvas.insertAdjacentElement(
            "afterend",
            emptyMessage
        );

    }

    const normalizedSections =
        Array.isArray(sectionPerformance)
            ? sectionPerformance.map(section => ({
                ...section,
                average_grade:
                    section.average_grade !== null &&
                    Number.isFinite(Number(section.average_grade))
                        ? Number(section.average_grade)
                        : null
            }))
            : [];

    const hasAnyGrade =
        normalizedSections.some(
            section =>
                section.average_grade !== null
        );

    const oldChart =
        Chart.getChart(canvas);

    if (oldChart) {
        oldChart.destroy();
    }

    /*
        Wala pang grades
    */

    if (!hasAnyGrade) {

        canvas.classList.add("hidden");

        emptyMessage.classList.remove(
            "hidden"
        );

        emptyMessage.innerHTML = `
            <div class="text-4xl mb-3">
                📊
            </div>

            <p class="font-medium text-gray-700">
                No grade data yet
            </p>

            <p class="text-xs text-gray-500 mt-1">
                Section performance will appear after grades are recorded.
            </p>
        `;

        return;

    }

    canvas.classList.remove("hidden");

    emptyMessage.classList.add("hidden");

    createOrReplaceChart(
        canvas,
        {
            type: "bar",

            data: {
                labels:
                    normalizedSections.map(
                        section =>
                            section.section_name
                    ),

                datasets: [
                    {
                        label:
                            "Average Grade",

                        data:
                            normalizedSections.map(
                                section =>
                                    section.average_grade
                            ),

                        backgroundColor:
                            "#3b82f6"
                    }
                ]
            },

            options: {

                responsive: true,

                plugins: {
                    legend: {
                        display: false
                    }
                },

                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }

            }
        }
    );

}
function createOrReplaceChart(canvas, config) {

    if (!canvas || typeof Chart === "undefined") {
        return null;
    }

    const existingChart = Chart.getChart(canvas);

    if (existingChart) {
        existingChart.destroy();
    }

    return new Chart(canvas, config);
}

function initCharts() {

    if (typeof Chart === "undefined") {
        console.warn(
            "Chart.js did not load. The app will continue without charts."
        );
        return;
    }

    if (currentRole === "student") {

        // Dynamic na ang Grade Progress chart.
        // loadStudentOfficialGrades() ang kumukuha at nagre-render
        // ng totoong official grades mula sa database.
        return;

    } else if (currentRole === "teacher") {

    // Dynamic na ang teacher chart.
    // populateTeacherContent() bahala na siya dito ASIHWEIDASIUHDAS NYE NYE
    return;

} else {

        const enrollCtx =
            document.getElementById("enrollmentChart");

        createOrReplaceChart(enrollCtx, {
            type: "line",

            data: {
                labels: [
                    "Jan",
                    "Feb",
                    "Mar",
                    "Apr",
                    "May",
                    "Jun"
                ],

                datasets: [{
                    label: "New Enrollments",
                    data: [120, 210, 180, 310, 290, 420],
                    borderColor: "#22c55e",
                    tension: 0.35
                }]
            },

            options: {
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }
}

let confirmPopupResolver = null;


function showConfirmPopup({
    title = "Confirmation",
    message = "Are you sure you want to continue?",
    confirmText = "Continue",
    cancelText = "Cancel",
    type = "info"
}) {

    const popup =
        document.getElementById("confirm-popup");

    const popupBox =
        document.getElementById(
            "confirm-popup-box"
        );

    const titleElement =
        document.getElementById(
            "confirm-popup-title"
        );

    const messageElement =
        document.getElementById(
            "confirm-popup-message"
        );

    const iconElement =
        document.getElementById(
            "confirm-popup-icon"
        );

    const confirmButton =
        document.getElementById(
            "confirm-popup-confirm"
        );

    const cancelButton =
        document.getElementById(
            "confirm-popup-cancel"
        );

    if (
        !popup ||
        !titleElement ||
        !messageElement ||
        !iconElement ||
        !confirmButton ||
        !cancelButton
    ) {
        return Promise.resolve(false);
    }

    titleElement.textContent = title;
    messageElement.textContent = message;

    confirmButton.textContent =
        confirmText;

    cancelButton.textContent =
        cancelText;

    if (type === "delete") {

        iconElement.innerHTML =
            `<i class="fa-solid fa-trash-can"></i>`;

        iconElement.className =
            "w-12 h-12 shrink-0 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center text-xl";

        confirmButton.className =
            "py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-semibold transition-all";

    } else if (type === "danger") {

        iconElement.innerHTML =
            `<i class="fa-solid fa-right-from-bracket"></i>`;

        iconElement.className =
            "w-12 h-12 shrink-0 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center text-xl";

        confirmButton.className =
            "py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-semibold transition-all";

    } else if (type === "warning") {

        iconElement.innerHTML =
            `<i class="fa-solid fa-triangle-exclamation"></i>`;

        iconElement.className =
            "w-12 h-12 shrink-0 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center text-xl";

        confirmButton.className =
            "py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-semibold transition-all";

    } else if (type === "quiz") {

    iconElement.innerHTML =
        `<i class="fa-solid fa-brain"></i>`;

    iconElement.className =
        "w-12 h-12 shrink-0 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center text-xl";

    confirmButton.className =
        "py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl font-semibold transition-all";

} else if (type === "notification") {

    iconElement.innerHTML =
        `<i class="fa-solid fa-key"></i>`;

    iconElement.className =
        "w-12 h-12 shrink-0 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center text-xl";

    confirmButton.className =
        "py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-semibold transition-all";

} else {

        iconElement.innerHTML =
            `<i class="fa-solid fa-circle-question"></i>`;

        iconElement.className =
            "w-12 h-12 shrink-0 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center text-xl";

        confirmButton.className =
            "py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-semibold transition-all";

    }

    popup.classList.remove("hidden");

    popup.classList.remove(
        "popup-backdrop-enter"
    );

    popupBox.classList.remove(
        "popup-enter"
    );

    void popup.offsetWidth;

    popup.classList.add(
        "popup-backdrop-enter"
    );

    popupBox.classList.add(
        "popup-enter"
    );

    return new Promise(resolve => {

        confirmPopupResolver = resolve;

        confirmButton.onclick = () => {
            closeConfirmPopup(true);
        };

        cancelButton.onclick = () => {
            closeConfirmPopup(false);
        };

    });

}


function closeConfirmPopup(result = false) {

    const popup =
        document.getElementById(
            "confirm-popup"
        );

    if (popup) {
        popup.classList.add("hidden");
    }

    if (confirmPopupResolver) {

        confirmPopupResolver(result);

        confirmPopupResolver = null;

    }

}


function showMessagePopup(
    title,
    message,
    type = "success"
) {

    const popup =
        document.getElementById(
            "message-popup"
        );

    const popupBox =
        document.getElementById(
            "message-popup-box"
        );

    const titleElement =
        document.getElementById(
            "message-popup-title"
        );

    const messageElement =
        document.getElementById(
            "message-popup-text"
        );

    const iconElement =
        document.getElementById(
            "message-popup-icon"
        );

    const button =
        document.getElementById(
            "message-popup-button"
        );

    if (
        !popup ||
        !titleElement ||
        !messageElement ||
        !iconElement ||
        !button
    ) {
        return;
    }

    titleElement.textContent = title;
    messageElement.textContent = message;

    if (type === "error") {

        iconElement.innerHTML =
            `<i class="fa-solid fa-xmark"></i>`;

        iconElement.className =
            "w-12 h-12 shrink-0 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center text-xl";

        button.className =
            "mt-7 w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-semibold transition-all";

    } else if (type === "warning") {

        iconElement.innerHTML =
            `<i class="fa-solid fa-triangle-exclamation"></i>`;

        iconElement.className =
            "w-12 h-12 shrink-0 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center text-xl";

        button.className =
            "mt-7 w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-semibold transition-all";

    } else if (type === "success") {

        iconElement.innerHTML =
            `<i class="fa-solid fa-check"></i>`;

        iconElement.className =
            "w-12 h-12 shrink-0 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl";

        button.className =
            "mt-7 w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-semibold transition-all";

    } else {

        iconElement.innerHTML =
            `<i class="fa-solid fa-circle-info"></i>`;

        iconElement.className =
            "w-12 h-12 shrink-0 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center text-xl";

        button.className =
            "mt-7 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-semibold transition-all";

    }

    popup.classList.remove("hidden");

    popup.classList.remove(
        "popup-backdrop-enter"
    );

    popupBox.classList.remove(
        "popup-enter"
    );

    void popup.offsetWidth;

    popup.classList.add(
        "popup-backdrop-enter"
    );

    popupBox.classList.add(
        "popup-enter"
    );

}


function closeMessagePopup() {

    const popup =
        document.getElementById(
            "message-popup"
        );

    if (popup) {
        popup.classList.add("hidden");
    }

}


function showLegacyAlert(message) {

    const original = String(message || "");
    const cleaned = original
        .replace(/^[✅❌⚠️🛎️]+\s*/u, "")
        .trim();

    const lower = cleaned.toLowerCase();

    let title = "Notice";
    let type = "info";

    if (
        original.includes("❌") ||
        /failed|cannot|error|invalid|denied/.test(lower)
    ) {
        title = "Action Failed";
        type = "error";

    } else if (
        /required|please|only teachers|must contain|not found|no file/.test(lower)
    ) {
        title = "Please Check";
        type = "warning";

    } else if (
        original.includes("✅") ||
        /success|updated|created|completed|saved/.test(lower)
    ) {
        title = "Success";
        type = "success";
    }

    showMessagePopup(
        title,
        cleaned || "The action was completed.",
        type
    );
}


let promptPopupResolver = null;

function showPromptPopup({
    title = "Enter Information",
    message = "",
    defaultValue = "",
    placeholder = "",
    confirmText = "Save",
    cancelText = "Cancel",
    multiline = false,
    inputType = "text",
    required = false,
    minLength = 0
} = {}) {

    const popup =
        document.getElementById(
            "prompt-popup"
        );

    const popupBox =
        document.getElementById(
            "prompt-popup-box"
        );

    const titleElement =
        document.getElementById(
            "prompt-popup-title"
        );

    const messageElement =
        document.getElementById(
            "prompt-popup-message"
        );

    const input =
        document.getElementById(
            "prompt-popup-input"
        );

    const textarea =
        document.getElementById(
            "prompt-popup-textarea"
        );

    const errorElement =
        document.getElementById(
            "prompt-popup-error"
        );

    const confirmButton =
        document.getElementById(
            "prompt-popup-confirm"
        );

    const cancelButton =
        document.getElementById(
            "prompt-popup-cancel"
        );

    if (
        !popup ||
        !popupBox ||
        !titleElement ||
        !messageElement ||
        !input ||
        !textarea ||
        !errorElement ||
        !confirmButton ||
        !cancelButton
    ) {
        return Promise.resolve(null);
    }

    titleElement.textContent = title;
    messageElement.textContent = message;
    confirmButton.textContent = confirmText;
    cancelButton.textContent = cancelText;

    input.classList.toggle(
        "hidden",
        multiline
    );

    textarea.classList.toggle(
        "hidden",
        !multiline
    );

    const field = multiline
        ? textarea
        : input;

    input.type = inputType;
    field.value = String(defaultValue || "");
    field.placeholder = placeholder;

    errorElement.textContent = "";
    errorElement.classList.add("hidden");

    popup.classList.remove("hidden");
    popupBox.classList.remove("popup-enter");
    void popupBox.offsetWidth;
    popupBox.classList.add("popup-enter");

    const submitValue = () => {
        const value = field.value;
        const trimmedValue = value.trim();

        if (required && !trimmedValue) {
            errorElement.textContent =
                "This field is required.";
            errorElement.classList.remove(
                "hidden"
            );
            field.focus();
            return;
        }

        if (
            Number(minLength) > 0 &&
            trimmedValue.length < Number(minLength)
        ) {
            errorElement.textContent =
                `Please enter at least ${minLength} characters.`;
            errorElement.classList.remove(
                "hidden"
            );
            field.focus();
            return;
        }

        closePromptPopup(value);
    };

    return new Promise(resolve => {
        promptPopupResolver = resolve;

        confirmButton.onclick =
            submitValue;

        cancelButton.onclick = () => {
            closePromptPopup(null);
        };

        field.onkeydown = event => {
            if (
                !multiline &&
                event.key === "Enter"
            ) {
                event.preventDefault();
                submitValue();
            }

            if (
                event.key === "Escape"
            ) {
                closePromptPopup(null);
            }
        };

        setTimeout(() => {
            field.focus();
            field.select();
        }, 30);
    });
}


function closePromptPopup(value = null) {

    const popup =
        document.getElementById(
            "prompt-popup"
        );

    if (popup) {
        popup.classList.add("hidden");
    }

    if (promptPopupResolver) {
        promptPopupResolver(value);
        promptPopupResolver = null;
    }
}


function readAiceeSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(AICEE_SETTINGS_KEY) || "{}");
        aiceeSettings = {
            ...defaultAiceeSettings,
            ...saved
        };
    } catch (error) {
        console.warn("Settings could not be read:", error);
        aiceeSettings = { ...defaultAiceeSettings };
    }

    return aiceeSettings;
}

function resolveTheme(theme) {
    if (theme !== "system") return theme;

    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

function applyAiceeSettings() {
    const root = document.documentElement;
    const body = document.body;
    const resolvedTheme = resolveTheme(aiceeSettings.theme);

    root.dataset.theme = resolvedTheme;
    root.dataset.themePreference = aiceeSettings.theme;
    root.dataset.accent = aiceeSettings.accent;
    root.dataset.animations = aiceeSettings.animations ? "on" : "off";
    root.dataset.loginAnimation = aiceeSettings.loginAnimation ? "on" : "off";

    if (body) {
        body.classList.toggle("aicee-compact", Boolean(aiceeSettings.compact));
    }

    if (typeof Chart !== "undefined") {
        Chart.defaults.color = resolvedTheme === "dark" ? "#9aa8bd" : "#64748b";
        Chart.defaults.borderColor = resolvedTheme === "dark" ? "#263247" : "#e7ebf2";

        if (Chart.instances) {
            Object.values(Chart.instances).forEach(chart => {
                try {
                    chart.update("none");
                } catch (error) {
                    console.warn("Chart theme refresh skipped:", error);
                }
            });
        }
    }

    syncSettingsControls();
}

function saveAiceeSettings() {
    localStorage.setItem(AICEE_SETTINGS_KEY, JSON.stringify(aiceeSettings));
    applyAiceeSettings();

    const status = document.getElementById("settings-save-status");
    if (status) {
        status.innerHTML = `<i class="fa-solid fa-circle-check"></i> Settings saved`;
        status.classList.add("settings-saved-pulse");
        setTimeout(() => status.classList.remove("settings-saved-pulse"), 500);
    }
}

function syncSettingsControls() {
    document.querySelectorAll("[data-theme-choice]").forEach(button => {
        button.classList.toggle("is-selected", button.dataset.themeChoice === aiceeSettings.theme);
    });

    document.querySelectorAll("[data-accent-choice]").forEach(button => {
        button.classList.toggle("is-selected", button.dataset.accentChoice === aiceeSettings.accent);
    });

    const animations = document.getElementById("setting-animations");
    const compact = document.getElementById("setting-compact");
    const loginAnimation = document.getElementById("setting-login-animation");

    if (animations) animations.checked = Boolean(aiceeSettings.animations);
    if (compact) compact.checked = Boolean(aiceeSettings.compact);
    if (loginAnimation) loginAnimation.checked = Boolean(aiceeSettings.loginAnimation);
}

function setThemePreference(theme) {
    if (!["light", "dark", "system"].includes(theme)) return;
    aiceeSettings.theme = theme;
    saveAiceeSettings();
}

function setAccentPreference(accent) {
    if (!["blue", "violet", "emerald", "rose", "amber"].includes(accent)) return;
    aiceeSettings.accent = accent;
    saveAiceeSettings();
}

function setBooleanSetting(key, value) {
    if (!["animations", "compact", "loginAnimation"].includes(key)) return;
    aiceeSettings[key] = Boolean(value);
    saveAiceeSettings();
}

async function resetAiceeSettings() {
    const confirmed = await showConfirmPopup({
        title: "Reset Appearance Settings?",
        message: "Your theme, accent color, spacing, and animation preferences will return to their defaults.",
        confirmText: "Reset Settings",
        cancelText: "Keep Current",
        type: "warning"
    });

    if (!confirmed) return;

    aiceeSettings = { ...defaultAiceeSettings };
    saveAiceeSettings();

    showMessagePopup(
        "Settings Reset",
        "Your AICEE appearance settings are back to their defaults.",
        "success"
    );
}

function setActiveSidebarPage(page) {
    document.querySelectorAll(".sidebar-link").forEach(link => {
        const onclick = link.getAttribute("onclick") || "";
        const isActive = onclick.includes(`navigateTo('${page}')`) || onclick.includes(`navigateTo(\"${page}\")`);
        link.classList.toggle("is-active", isActive);
    });
}

let aiceeSpeechTypingTimer = null;
let aiceeSpeechHoldTimer = null;

function speakAicee(message, options = {}) {
    const bubble = document.getElementById("aicee-speech-bubble");
    const text = document.getElementById("aicee-speech-text");

    if (!bubble || !text || !message) return;

    const {
        hold = 3200,
        type = true
    } = options;

    if (aiceeSpeechTypingTimer) {
        clearInterval(aiceeSpeechTypingTimer);
        aiceeSpeechTypingTimer = null;
    }

    if (aiceeSpeechHoldTimer) {
        clearTimeout(aiceeSpeechHoldTimer);
        aiceeSpeechHoldTimer = null;
    }

    bubble.classList.add("is-speaking");
    bubble.classList.remove("is-resting");

    const finalMessage = String(message);

    if (!type || !aiceeSettings.animations) {
        text.textContent = finalMessage;
    } else {
        text.textContent = "";
        let index = 0;

        aiceeSpeechTypingTimer = setInterval(() => {
            index += 1;
            text.textContent = finalMessage.slice(0, index);

            if (index >= finalMessage.length) {
                clearInterval(aiceeSpeechTypingTimer);
                aiceeSpeechTypingTimer = null;
            }
        }, 18);
    }

    if (hold > 0) {
        aiceeSpeechHoldTimer = setTimeout(() => {
            bubble.classList.remove("is-speaking");
            bubble.classList.add("is-resting");
        }, hold);
    }
}

function setupAiceeMascotInteractions() {
    const email = document.getElementById("email");
    const password = document.getElementById("password");
    const submit = document.getElementById("login-submit-button");
    const forgot = document.querySelector('.login-text-button[onclick*="showForgotPasswordModal"]');

    if (email && email.dataset.aiceeSpeechReady !== "true") {
        email.dataset.aiceeSpeechReady = "true";
        email.addEventListener("focus", () => {
            speakAicee("Enter your school email here. ✉️");
        });
    }

    if (password && password.dataset.aiceeSpeechReady !== "true") {
        password.dataset.aiceeSpeechReady = "true";
        password.addEventListener("focus", () => {
            speakAicee("Your password stays private. 🔐");
        });
    }

    if (submit && submit.dataset.aiceeSpeechReady !== "true") {
        submit.dataset.aiceeSpeechReady = "true";
        submit.addEventListener("mouseenter", () => {
            if (!submit.disabled) {
                speakAicee("Ready? I’ll check your account when you sign in. ✨", { hold: 2400 });
            }
        });
    }

    if (forgot && forgot.dataset.aiceeSpeechReady !== "true") {
        forgot.dataset.aiceeSpeechReady = "true";
        forgot.addEventListener("mouseenter", () => {
            speakAicee("Forgot it? No worries — we can recover your account.", { hold: 2600 });
        });
    }

    setTimeout(() => {
        speakAicee("Hi! I’m AIcee. Ready to continue learning? 👋", { hold: 4300 });
    }, 450);
}

function toggleLoginPassword() {
    const input = document.getElementById("password");
    const button = document.getElementById("login-password-toggle");

    if (!input || !button) return;

    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.innerHTML = show
        ? `<i class="fa-regular fa-eye-slash"></i>`
        : `<i class="fa-regular fa-eye"></i>`;
    button.setAttribute("aria-label", show ? "Hide password" : "Show password");

    // AIcee gives the password field some privacy in real-time 3D.
    if (show) {
        speakAicee("Oh! I’ll look away while your password is visible. 🙈", { hold: 4200 });
        window.AIcee3D?.turnAway?.();
    } else {
        speakAicee("All clear — I’m looking back now! 👀", { hold: 3200 });
        window.AIcee3D?.turnBack?.();
    }
}

function shakeLoginCard() {
    const card = document.querySelector(".login-card");
    if (!card || !aiceeSettings.animations) return;

    card.classList.remove("login-shake");
    void card.offsetWidth;
    card.classList.add("login-shake");
}

function setupLoginKeyboard() {
    ["email", "password"].forEach(id => {
        const input = document.getElementById(id);
        if (!input || input.dataset.enterReady === "true") return;

        input.dataset.enterReady = "true";
        input.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                login();
            }
        });
    });
}

function enhanceInteractiveElements() {
    document.querySelectorAll("button").forEach(button => {
        if (button.dataset.rippleReady === "true") return;
        button.dataset.rippleReady = "true";
        button.classList.add("aicee-button-motion");

        button.addEventListener("pointerdown", event => {
            if (!aiceeSettings.animations || button.disabled) return;

            const rect = button.getBoundingClientRect();
            const ripple = document.createElement("span");
            const size = Math.max(rect.width, rect.height) * 1.2;

            ripple.className = "aicee-ripple";
            ripple.style.width = `${size}px`;
            ripple.style.height = `${size}px`;
            ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
            ripple.style.top = `${event.clientY - rect.top - size / 2}px`;

            button.appendChild(ripple);
            setTimeout(() => ripple.remove(), 650);
        });
    });
}


function enhanceVfxSurfaces() {
    if (!aiceeSettings.animations) return;

    document
        .querySelectorAll(
            ".aicee-panel, .login-card, #ai-modal .modal"
        )
        .forEach(surface => {
            if (surface.dataset.vfxReady === "true") return;

            surface.dataset.vfxReady = "true";
            surface.classList.add("aicee-vfx-surface");

            surface.addEventListener("pointermove", event => {
                if (!aiceeSettings.animations) return;

                const rect =
                    surface.getBoundingClientRect();

                const x =
                    ((event.clientX - rect.left) /
                        Math.max(rect.width, 1)) *
                    100;

                const y =
                    ((event.clientY - rect.top) /
                        Math.max(rect.height, 1)) *
                    100;

                surface.style.setProperty(
                    "--aicee-vfx-x",
                    `${x}%`
                );

                surface.style.setProperty(
                    "--aicee-vfx-y",
                    `${y}%`
                );
            });
        });
}

function initializeAiceeVfx() {
    enhanceVfxSurfaces();

    document
        .documentElement
        .classList
        .add("aicee-vfx-loaded");
}

function initializeAiceeExperience() {
    readAiceeSettings();
    applyAiceeSettings();
    setupLoginKeyboard();
    setupAiceeMascotInteractions();
    enhanceInteractiveElements();
    initializeAiceeVfx();

    if (window.matchMedia) {
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const listener = () => {
            if (aiceeSettings.theme === "system") applyAiceeSettings();
        };

        if (typeof media.addEventListener === "function") {
            media.addEventListener("change", listener);
        }
    }

    const observer = new MutationObserver(() => {
        enhanceInteractiveElements();
        enhanceVfxSurfaces();
    });

    observer.observe(
        document.body,
        {
            childList: true,
            subtree: true
        }
    );
}


async function login() {

    const emailInput =
        document.getElementById("email");

    const passwordInput =
        document.getElementById("password");

    const errorBox =
        document.getElementById("login-error");

    const submitButton =
        document.getElementById("login-submit-button");

    const buttonContent =
        document.getElementById("login-button-content");

    const buttonLoading =
        document.getElementById("login-button-loading");

    if (!emailInput || !passwordInput || !errorBox) {
        console.error(
            "Login form elements are missing."
        );
        return;
    }

    const email =
        emailInput.value.trim();

    const password =
        passwordInput.value;

    errorBox.textContent = "";

    if (submitButton) submitButton.disabled = true;
    if (buttonContent) buttonContent.classList.add("hidden");
    if (buttonLoading) {
        buttonLoading.classList.remove("hidden");
        buttonLoading.classList.add("flex");
    }

    speakAicee("Checking your account… one moment. ✨", { hold: 0 });
    window.AIcee3D?.setBusy?.(true);

    let data;

    const restoreLoginButton = () => {
        if (submitButton) submitButton.disabled = false;
        if (buttonContent) buttonContent.classList.remove("hidden");
        if (buttonLoading) {
            buttonLoading.classList.add("hidden");
            buttonLoading.classList.remove("flex");
        }
    };

    try {

        const response = await fetch(
            "/login",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    email,
                    password
                })
            }
        );

        data = await response.json();

        if (!response.ok || !data.success) {

            errorBox.textContent =
                "❌ " +
                (
                    data.message ||
                    "Invalid email or password"
                );

            restoreLoginButton();
            speakAicee("Hmm, that sign-in didn’t work. Check your email and password, then try again.", { hold: 4600 });
            window.AIcee3D?.setBusy?.(false);
            window.AIcee3D?.sad?.();
            shakeLoginCard();
            return;
        }

    } catch (error) {

        console.error(
            "Login request error:",
            error
        );

        errorBox.textContent =
            "Cannot connect to the backend server.";

        restoreLoginButton();
        speakAicee("I can’t reach the server right now. Check the backend, then try again.", { hold: 4600 });
        window.AIcee3D?.setBusy?.(false);
        window.AIcee3D?.sad?.();
        shakeLoginCard();
        return;
    }

    if (!data.token) {
        errorBox.textContent =
            "Login succeeded without a secure session token.";
        restoreLoginButton();
        speakAicee("Your account responded, but the secure session could not start. Please try again.", { hold: 4600 });
        window.AIcee3D?.setBusy?.(false);
        window.AIcee3D?.sad?.();
        return;
    }

    localStorage.setItem(
        AICEE_TOKEN_KEY,
        data.token
    );

    currentUser.id =
        data.user.id;

    currentUser.name =
        data.user.name || "";

    currentUser.email =
        data.user.email || "";

    currentUser.role =
        String(
            data.user.role || "student"
        )
            .trim()
            .toLowerCase();

    currentUser.bio =
        data.user.bio || "";

    currentUser.diagnostic_completed =
        Number(
            data.user.diagnostic_completed
        ) || 0;

    currentUser.must_change_password =
    Number(data.user.must_change_password) || 0;   

    localStorage.setItem(
        "user",
        JSON.stringify(currentUser)
    );

    if (
    currentUser.must_change_password === 1
) {

    document
        .getElementById("login-page")
        .classList.add("hidden");

    document
        .getElementById("main-app")
        .classList.add("hidden");

    window.AIcee3D?.setBusy?.(false);
    window.AIcee3D?.reset?.();
    openFirstLoginPasswordModal();
    restoreLoginButton();

    return;
}

    try {

        const loginPage =
            document.getElementById(
                "login-page"
            );

        const mainApp =
            document.getElementById(
                "main-app"
            );

        if (!loginPage || !mainApp) {
            throw new Error(
                "Login page or main application container is missing."
            );
        }

        window.AIcee3D?.setBusy?.(false);

        const loginFirstName = String(currentUser.name || "Student")
            .trim()
            .split(/\s+/)[0] || "Student";

        speakAicee(`Welcome back, ${loginFirstName}! Let’s make progress today. 🎉`, { hold: 0 });
        window.AIcee3D?.success?.();

        // Give the mascot a brief visible success reaction before entering AICEE.
        if (window.AIcee3D?.isReady?.() && aiceeSettings.animations) {
            await new Promise(resolve => setTimeout(resolve, 650));
        }

        loginPage.classList.add(
            "hidden"
        );

        mainApp.classList.remove(
            "hidden"
        );

        createSidebar(
            currentUser.role
        );

        switchRole(
            currentUser.role
        );

        populateProfile();

        await loadDashboard();
        if (currentUser.role === "student") await loadDiagnosticProfileData();

        initCharts();

        await checkDiagnosticQuiz();
        restoreLoginButton();

    } catch (error) {

        console.error(
            "Post-login initialization error:",
            error
        );

        errorBox.textContent =
            "Login succeeded, but the dashboard failed to initialize.";

        const loginPage =
            document.getElementById(
                "login-page"
            );

        const mainApp =
            document.getElementById(
                "main-app"
            );

        if (mainApp) {
            mainApp.classList.add(
                "hidden"
            );
        }

        if (loginPage) {
            loginPage.classList.remove(
                "hidden"
            );
        }

        restoreLoginButton();
        window.AIcee3D?.sad?.();
        shakeLoginCard();
    }
}

async function logout() {

    const confirmed =
        await showConfirmPopup({
            title:
                "Log Out of AICEE?",

            message:
                "Are you sure you want to end your current session?",

            confirmText:
                "Log Out",

            cancelText:
                "Cancel",

            type:
                "danger"
        });

    if (!confirmed) {
        return;
    }

    try {
        await fetch(
            `${AICEE_API_ORIGIN}/logout`,
            { method: "POST" }
        );
    } catch (error) {
        console.warn(
            "Server logout warning:",
            error
        );
    }

    clearAiceeSession();

    currentUser = {
        id: null,
        name: "",
        role: "",
        email: "",
        bio: "",
        section_name: "",
        created_at: null,
        diagnostic_completed: 0,
        must_change_password: 0
    };

    currentRole = "student";

    const mainApp =
        document.getElementById(
            "main-app"
        );

    const loginPage =
        document.getElementById(
            "login-page"
        );

    if (mainApp) {
        mainApp.classList.add("hidden");
    }

    if (loginPage) {
        loginPage.classList.remove("hidden");
    }

    window.AIcee3D?.reset?.();

}


async function ensureTeacherLearningData() {
    if (currentRole !== "teacher") return;

    if (!Array.isArray(managedStudents) || managedStudents.length === 0) {
        try {
            const response = await fetch(`/teacher-students/${currentUser.id}`);
            const data = await response.json();
            if (response.ok && data.success) {
                managedStudents = Array.isArray(data.students) ? data.students : [];
            }
        } catch (error) {
            console.warn("Teacher student learning data warning:", error);
        }
    }

    const hasDashboardData =
        latestTeacherDashboardData &&
        (
            Object.keys(latestTeacherDashboardData.stats || {}).length > 0 ||
            (latestTeacherDashboardData.at_risk_students || []).length > 0
        );

    if (!hasDashboardData) {
        await populateTeacherContent();
    }
}

async function renderTeacherAIInsightsPage() {
    if (currentRole !== "teacher") return;

    await ensureTeacherLearningData();

    const total = managedStudents.length || Number(latestTeacherDashboardData.stats?.total_students) || 0;
    const ready = managedStudents.filter(
        student => Number(student.diagnostic_completed) === 1
    ).length;
    const pending = Math.max(0, total - ready);
    const atRisk = Array.isArray(latestTeacherDashboardData.at_risk_students)
        ? latestTeacherDashboardData.at_risk_students
        : [];

    const totalEl = document.getElementById("teacher-insights-total");
    const readyEl = document.getElementById("teacher-insights-ready");
    const pendingEl = document.getElementById("teacher-insights-pending");
    const supportEl = document.getElementById("teacher-insights-support");
    const list = document.getElementById("teacher-insights-student-list");

    if (totalEl) totalEl.textContent = total;
    if (readyEl) readyEl.textContent = ready;
    if (pendingEl) pendingEl.textContent = pending;
    if (supportEl) supportEl.textContent = atRisk.length;

    if (list) {
        if (atRisk.length === 0) {
            list.innerHTML = `
                <div class="rounded-2xl bg-emerald-50 border border-emerald-100 p-5 text-sm text-emerald-700">
                    <div class="font-semibold"><i class="fa-solid fa-circle-check mr-2"></i>No urgent learning signals right now</div>
                    <p class="mt-2 text-emerald-700/80">Students who fall below the current support threshold will appear here as learning-priority signals for the prototype.</p>
                </div>
            `;
        } else {
            list.innerHTML = atRisk.map(student => {
                const name = escapeHTML(student.student_name || "Student");
                const grade = Number(student.average_grade) || 0;
                return `
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border border-gray-100 rounded-2xl p-4">
                        <div>
                            <div class="font-semibold text-gray-900">${name}</div>
                            <div class="text-xs text-gray-500 mt-1">AIcee may prioritize clearer explanations, guided review, and follow-up checks for this learner.</div>
                        </div>
                        <span class="inline-flex self-start sm:self-auto px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">${grade}% signal</span>
                    </div>
                `;
            }).join("");
        }
    }
}

function renderTeacherContextDataPage() {
    if(currentRole!=="teacher") return;
    const portalList=document.getElementById("teacher-context-portal-list");
    const moodleList=document.getElementById("teacher-context-moodle-list");
    if(portalList) portalList.innerHTML='<div class="text-sm text-gray-500">Grade/Portal context is not used by the current AIcee personalization flow.</div>';
    if(moodleList) moodleList.innerHTML='<div class="text-sm text-gray-500">Teacher-uploaded PDF learning materials are used only when a student selects a material inside AIcee.</div>';
}

function openTeacherStudentInsight(studentId) {
    const student = managedStudents.find(
        item => Number(item.id) === Number(studentId)
    );

    if (!student) {
        showMessagePopup("Student not found", "Refresh the Student Learning Profiles page and try again.", "error");
        return;
    }

    const diagnosticReady = Number(student.diagnostic_completed) === 1;
    const readiness = diagnosticReady
        ? "AI learning profile is ready for personalization."
        : "Diagnostic assessment is still pending, so personalization is limited.";

    showMessagePopup(
        "AI Learning Profile",
        `${student.name}\nSection: ${student.section_name || "No section"}\nDiagnostic: ${diagnosticReady ? "Completed" : "Pending"}\n\n${readiness}\n\nAIcee uses recurring diagnostic results as the main learning signal. Teacher-uploaded PDF materials can also be selected by students inside AIcee for lesson-based guidance.`,
        diagnosticReady ? "success" : "warning"
    );
}

async function navigateTo(page) {

    closeMobileSidebar();

    const studentHiddenLmsPages = new Set([
        "modules",
        "assignments",
        "submissions",
        "gradebook",
        "grades"
    ]);

    const teacherHiddenLmsPages = new Set([
        "modules",
        "assignments",
        "submissions",
        "gradebook",
        "grades"
    ]);

    if (
        (currentRole === "student" && studentHiddenLmsPages.has(page)) ||
        (currentRole === "teacher" && teacherHiddenLmsPages.has(page))
    ) {
        page = "dashboard";
    }

    const titleEl =
        document.getElementById(
            "current-page-title"
        );

    if (titleEl) {
        const pageTitles = {
            dashboard: "Dashboard",
            students: currentRole === "teacher" ? "Student Learning Profiles" : "Students",
            "teacher-ai-insights": "AI Learning Insights",
            "teacher-context": "AI Context Data",
            "admin-accounts": "Account Management",
            "admin-sections": "Sections",
            "admin-data-sources": "Data Sources",
            profile: currentRole === "student" ? "My Learning Profile" : (currentRole === "admin" ? "My Admin Profile" : "Profile"),
            settings: "Settings"
        };

        titleEl.textContent = pageTitles[page] ||
            (page.charAt(0).toUpperCase() + page.slice(1));
    }

    setActiveSidebarPage(page);
    hideAllDashboards();

    if (page === "admin-accounts") {
        if (currentRole !== "admin") return;
        const view = document.getElementById("admin-accounts-view");
        if (view) {
            view.classList.remove("hidden");
            animatePage(view);
        }
        await Promise.all([loadAdminAccounts(), loadAdminSections()]);
        return;
    }

    if (page === "admin-sections") {
        if (currentRole !== "admin") return;
        const view = document.getElementById("admin-sections-view");
        if (view) {
            view.classList.remove("hidden");
            animatePage(view);
        }
        await Promise.all([loadAdminAccounts(), loadAdminSections()]);
        renderAdminSections();
        return;
    }

    if (page === "admin-data-sources") {
        if (currentRole !== "admin") return;
        const view = document.getElementById("admin-data-sources-view");
        if (view) {
            view.classList.remove("hidden");
            animatePage(view);
        }
        return;
    }

    if (page === "teacher-ai-insights") {
        if (currentRole !== "teacher") return;

        const view = document.getElementById("teacher-ai-insights-view");
        if (view) {
            view.classList.remove("hidden");
            animatePage(view);
        }

        await renderTeacherAIInsightsPage();
        return;
    }

    if (page === "teacher-context") {
        if (currentRole !== "teacher") return;

        const view = document.getElementById("teacher-context-view");
        if (view) {
            view.classList.remove("hidden");
            animatePage(view);
        }

        renderTeacherContextDataPage();
        return;
    }

    if (page === "students") {

        const studentsView =
            document.getElementById(
                "students-view"
            );

        if (studentsView) {
            studentsView.classList.remove(
                "hidden"
            );

            animatePage(
                studentsView
            );
        }

        await loadManagedStudents();
        return;
    }

    if (page === "modules") {

        const modulesView =
            document.getElementById(
                "modules-view"
            );

        if (modulesView) {
            modulesView.classList.remove(
                "hidden"
            );

            animatePage(
                modulesView
            );
        }

        populateModules();
        return;
    }

    if (page === "assignments") {

        const assignmentsView =
            document.getElementById(
                "assignments-view"
            );

        if (assignmentsView) {
            assignmentsView.classList.remove(
                "hidden"
            );

            animatePage(
                assignmentsView
            );
        }

        await loadAssignments();
        return;
    }

    if (page === "submissions") {

    const submissionsView =
        document.getElementById(
            "submissions-view"
        );

    if (submissionsView) {

        submissionsView.classList.remove(
            "hidden"
        );

        animatePage(
            submissionsView
        );

    }

    await loadTeacherSubmissions();

    return;
}

    if (page === "gradebook") {

        if (currentRole !== "teacher") {
            return;
        }

        const gradebookView =
            document.getElementById(
                "gradebook-view"
            );

        if (gradebookView) {
            gradebookView.classList.remove(
                "hidden"
            );

            animatePage(
                gradebookView
            );
        }

        await loadGradebookSections();
        return;
    }

    if (page === "grades") {

        const gradesView =
            document.getElementById(
                "grades-view"
            );

        if (gradesView) {
            gradesView.classList.remove(
                "hidden"
            );

            animatePage(
                gradesView
            );
        }

        if (currentRole === "student") {
            await loadStudentOfficialGrades();
        } else {
            populateFullGrades();
        }

        return;
    }

    if (page === "settings") {
        const settingsView = document.getElementById("settings-view");

        if (settingsView) {
            settingsView.classList.remove("hidden");
            animatePage(settingsView);
        }

        syncSettingsControls();
        setActiveSidebarPage("settings");
        return;
    }

    if (page === "profile") {

        const profileView =
            document.getElementById(
                "profile-view"
            );

        if (profileView) {
            profileView.classList.remove(
                "hidden"
            );

            animatePage(
                profileView
            );
        }

        await loadProfile();
        return;
    }

    if (currentRole === "student") {

        const studentDashboard =
            document.getElementById(
                "student-dashboard"
            );

        if (studentDashboard) {
            studentDashboard.classList.remove(
                "hidden"
            );

            animatePage(
                studentDashboard
            );
        }

    } else if (currentRole === "teacher") {

        const teacherDashboard =
            document.getElementById(
                "teacher-dashboard"
            );

        if (teacherDashboard) {
            teacherDashboard.classList.remove(
                "hidden"
            );

            animatePage(
                teacherDashboard
            );
        }

        // Refresh analytics whenever the teacher returns to Dashboard.
        await populateTeacherContent();

    } else {

        const adminDashboard =
            document.getElementById(
                "admin-dashboard"
            );

        if (adminDashboard) {
            adminDashboard.classList.remove(
                "hidden"
            );

            animatePage(
                adminDashboard
            );
        }

        await loadAdminOverview();
    }
}


async function loadAIceeLearningMaterials(){
    if(currentRole!=="student"||!currentUser.id) return;
    const select=document.getElementById("ai-module-select"); if(!select) return;
    select.innerHTML='<option value="">No specific learning material</option>';
    try{
        const r=await fetch(`/ai-learning-materials/${currentUser.id}`); const d=await r.json();
        if(!r.ok||!d.success) throw new Error(d.message||"Failed to load learning materials.");
        aiLearningMaterials=Array.isArray(d.modules)?d.modules:[];
        aiLearningMaterials.forEach(m=>{const o=document.createElement("option");o.value=m.id;o.textContent=m.ai_readable?`${m.title} — ${m.teacher_name}`:`${m.title} — PDF required for AI reading`;o.disabled=!m.ai_readable;select.appendChild(o);});
    }catch(e){console.error("Learning materials load error:",e);}
}

function appendAIChatMessage(role, text, options = {}) {
    const chat = document.getElementById("ai-chat-log");
    if (!chat) return null;

    const messageText = String(text || "").trim();
    if (!messageText) return null;

    if (role === "user") {
        const wrapper = document.createElement("div");
        wrapper.className = "flex justify-end mb-6 aicee-chat-row aicee-chat-row-user";

        const bubble = document.createElement("div");
        bubble.className =
            "aicee-chat-bubble aicee-user-bubble px-5 py-3 rounded-3xl max-w-[70%] whitespace-pre-wrap break-words";
        bubble.textContent = messageText;

        if (options.moduleTitle) {
            const material = document.createElement("div");
            material.className = "aicee-material-tag text-[11px] opacity-80 mt-2";
            material.textContent = `Material: ${options.moduleTitle}`;
            bubble.appendChild(material);
        }

        wrapper.appendChild(bubble);
        chat.appendChild(wrapper);

        requestAnimationFrame(() => {
            wrapper.classList.add("aicee-chat-row-visible");
        });

        return wrapper;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "flex justify-start mb-4 aicee-chat-row aicee-chat-row-model";

    const bubble = document.createElement("div");
    bubble.className = options.warning
        ? "aicee-chat-bubble aicee-warning-bubble p-4 rounded-3xl max-w-[80%] whitespace-pre-wrap break-words"
        : options.fallback
            ? "aicee-chat-bubble aicee-error-bubble p-4 rounded-3xl max-w-[80%] whitespace-pre-wrap break-words"
            : "aicee-chat-bubble aicee-assistant-bubble p-4 rounded-3xl max-w-[80%] whitespace-pre-wrap break-words";

    bubble.textContent = messageText;
    wrapper.appendChild(bubble);
    chat.appendChild(wrapper);

    requestAnimationFrame(() => {
        wrapper.classList.add("aicee-chat-row-visible");
    });

    return wrapper;
}

function showAIceeThinkingIndicator(selectedMaterial = null) {
    const chat = document.getElementById("ai-chat-log");
    if (!chat) return null;

    document
        .getElementById("aicee-thinking-indicator")
        ?.remove();

    const wrapper = document.createElement("div");
    wrapper.id = "aicee-thinking-indicator";
    wrapper.className =
        "flex justify-start mb-4 aicee-chat-row aicee-chat-row-model aicee-chat-row-visible";

    const bubble = document.createElement("div");
    bubble.className =
        "aicee-chat-bubble aicee-assistant-bubble aicee-thinking-bubble p-4 rounded-3xl max-w-[88%]";

    const row = document.createElement("div");
    row.className = "flex items-start gap-3";

    const orb = document.createElement("div");
    orb.className = "aicee-thinking-orb";
    orb.innerHTML = `
        <span></span>
        <span></span>
        <span></span>
    `;

    const copy = document.createElement("div");
    copy.className = "min-w-0";

    const title = document.createElement("div");
    title.className = "aicee-thinking-title font-semibold text-sm";

    const subtitle = document.createElement("div");
    subtitle.className =
        "aicee-thinking-subtitle text-xs opacity-70 mt-1 leading-relaxed";

    function setStatus(nextTitle, nextSubtitle) {
        title.textContent = nextTitle;
        subtitle.textContent = nextSubtitle;
        chat.scrollTop = chat.scrollHeight;
    }

    if (selectedMaterial) {
        setStatus(
            "AIcee is reading your learning material...",
            `Preparing a guided response using "${selectedMaterial.title}".`
        );
    } else {
        setStatus(
            "AIcee is reviewing your learning context...",
            "Please wait while I prepare a guided response."
        );
    }

    copy.appendChild(title);
    copy.appendChild(subtitle);

    row.appendChild(orb);
    row.appendChild(copy);

    bubble.appendChild(row);
    wrapper.appendChild(bubble);
    chat.appendChild(wrapper);

    chat.scrollTop = chat.scrollHeight;

    const timers = [
        setTimeout(() => {
            if (!wrapper.isConnected) return;

            if (selectedMaterial) {
                setStatus(
                    "AIcee is analyzing the material...",
                    "Connecting the lesson with your learning profile."
                );
            } else {
                setStatus(
                    "AIcee is thinking through your question...",
                    "Using your recent learning context to guide the response."
                );
            }
        }, 3500),

        setTimeout(() => {
            if (!wrapper.isConnected) return;

            setStatus(
                "AIcee is preparing your personalized guidance...",
                selectedMaterial
                    ? "Almost ready — organizing the material into a clearer explanation."
                    : "Almost ready — organizing the response into helpful steps."
            );
        }, 7500),

        setTimeout(() => {
            if (!wrapper.isConnected) return;

            setStatus(
                "Still working on it...",
                selectedMaterial
                    ? "Large learning materials may take a little longer to process."
                    : "The AI service is taking a little longer than usual."
            );
        }, 14000)
    ];

    return {
        element: wrapper,
        remove() {
            timers.forEach(timer => clearTimeout(timer));
            wrapper.classList.add("aicee-thinking-out");

            setTimeout(() => {
                wrapper.remove();
            }, 180);
        }
    };
}

function setAIceeComposerBusy(isBusy) {
    const input = document.getElementById("ai-input");
    const select = document.getElementById("ai-module-select");
    const sendButton =
        document.getElementById("ai-send-button") ||
        document.querySelector('#ai-modal button[onclick*="sendAIMessage"]');

    if (input) input.disabled = Boolean(isBusy);
    if (select) select.disabled = Boolean(isBusy);
    if (sendButton) {
        sendButton.disabled = Boolean(isBusy);
        sendButton.classList.toggle("aicee-send-busy", Boolean(isBusy));
    }
}

// 1. LOAD AI CHAT HISTORY (Naka-default na sa currentConversationId)
async function loadAIChatHistory(conversationId) {
    const targetId = conversationId || currentConversationId;
    if (currentRole !== "student" || !currentUser.id || !targetId) {
        return [];
    }

    try {
        const response = await fetch(
            `/ai/conversations/${targetId}/messages`
        );
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.message || "Failed to load AIcee chat history."
            );
        }

        const messages = Array.isArray(data.messages)
            ? data.messages
            : [];

        messages.forEach(item => {
            appendAIChatMessage(
                item.role === "user" ? "user" : "model",
                item.content,
                {
                    moduleTitle: item.module_title || null,
                    fallback: Boolean(item.is_fallback)
                }
            );
        });

        return messages;
    } catch (error) {
        console.error(
            "AIcee chat history load error:",
            error
        );
        return [];
    }
}

// 2. OPEN AI ASSISTANT (Kukuha muna ng active chat bago i-load ang history)
async function openAIAssistant() {
    const modal = document.getElementById("ai-modal");
    if (!modal) return;

    modal.classList.remove("hidden");
    modal.classList.remove("aicee-ai-modal-open");
    void modal.offsetWidth;
    modal.classList.add("aicee-ai-modal-open");

    await loadAIceeLearningMaterials();

    const chat = document.getElementById("ai-chat-log");
    if (!chat) return;

    chat.innerHTML = "";

    const greeting = document.createElement("div");
    greeting.className =
        "aicee-chat-bubble aicee-assistant-bubble aicee-greeting-bubble p-4 rounded-2xl max-w-[80%] whitespace-pre-wrap break-words mb-4";

    const firstName =
        String(currentUser.name || "Student")
            .trim()
            .split(/\s+/)[0] || "Student";

    const focus =
        getPrototypeLearningSignals().needsFocus?.subject;

    greeting.textContent = focus
        ? `Hello ${firstName}! Based on your latest diagnostic profile, ${focus} may be useful to review. Your recent AIcee chat history will also appear here. You can choose a teacher-provided PDF below when you want to study from a specific material.`
        : `Hello ${firstName}! Your recent AIcee chat history will appear here. Ask me about any lesson, or choose a teacher-provided PDF below so I can guide you using that learning material.`;

    chat.appendChild(greeting);

    // Kumuha muna ng huling active conversation sa backend kung wala pa
    if (!currentConversationId) {
        try {
            const res = await fetch("/ai/conversations");
            const data = await res.json();
            if (res.ok && data.success && Array.isArray(data.conversations) && data.conversations.length > 0) {
                currentConversationId = data.conversations[0].id;
            }
        } catch (e) {
            console.warn("Could not fetch active conversation:", e);
        }
    }

    // I-load na ang mga dating mensahe sa active conversation
    if (currentConversationId) {
        await loadAIChatHistory(currentConversationId);
    }
    chat.scrollTop = chat.scrollHeight;

    const input = document.getElementById("ai-input");
    setTimeout(() => input?.focus(), 180);
}

// Function para i-fetch at ipakita ang listahan ng past chats sa sidebar/modal
async function loadConversationsList() {
    if (currentRole !== "student" || !currentUser.id) return;

    const listContainer = document.getElementById("ai-conversations-list");
    if (!listContainer) return; // Siguraduhing may element na may ID na ito sa HTML

    try {
        const response = await fetch("/ai/conversations");
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Failed to load chat sessions.");
        }

        const conversations = Array.isArray(data.conversations) ? data.conversations : [];

        if (conversations.length === 0) {
            listContainer.innerHTML = `<div class="text-xs text-gray-400 p-3 text-center">No chat history yet.</div>`;
            return;
        }

        listContainer.innerHTML = conversations.map(chat => `
            <button 
                type="button" 
                onclick="selectConversation(${chat.id})" 
                class="w-full text-left p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-between ${currentConversationId === chat.id ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-gray-700'}"
            >
                <span class="truncate text-sm flex-1 mr-2">${escapeHTML(chat.title || 'Untitled Chat')}</span>
                ${chat.is_pinned ? '<i class="fa-solid fa-thumbtack text-xs text-amber-500"></i>' : ''}
            </button>
        `).join("");

    } catch (error) {
        console.error("Load conversations error:", error);
    }
}

// Function para mag-reset at mag-umpisa ng panibagong chat
async function startNewChat() {
    currentConversationId = null;

    const chatLog = document.getElementById("ai-chat-log");
    if (chatLog) chatLog.innerHTML = "";

    // Re-open/refresh assistant screen para mag-appear ang default greeting
    await openAIAssistant();
    await loadConversationsList();
}


// Function kapag in-click ang isang conversation sa listahan
async function selectConversation(conversationId) {
    if (!conversationId) return;

    currentConversationId = conversationId;

    const chatLog = document.getElementById("ai-chat-log");
    if (chatLog) chatLog.innerHTML = ""; // I-clear ang kasalukuyang chat window

    // Load ang mga mensahe ng napiling conversation ID
    await loadAIChatHistory(conversationId);

    // Refresh ang listahan para mag-highlight ang active chat
    await loadConversationsList();
}

async function openAIAssistant() {
    const modal = document.getElementById("ai-modal");
    if (!modal) return;

    modal.classList.remove("hidden");
    modal.classList.remove("aicee-ai-modal-open");
    void modal.offsetWidth;
    modal.classList.add("aicee-ai-modal-open");

    await loadAIceeLearningMaterials();

    const chat = document.getElementById("ai-chat-log");
    if (!chat) return;

    chat.innerHTML = "";

    const greeting = document.createElement("div");
    greeting.className =
        "aicee-chat-bubble aicee-assistant-bubble aicee-greeting-bubble p-4 rounded-2xl max-w-[80%] whitespace-pre-wrap break-words mb-4";

    const firstName =
        String(currentUser.name || "Student")
            .trim()
            .split(/\s+/)[0] || "Student";

    const focus =
        getPrototypeLearningSignals().needsFocus?.subject;

    greeting.textContent = focus
        ? `Hello ${firstName}! Based on your latest diagnostic profile, ${focus} may be useful to review. Your recent AIcee chat history will also appear here. You can choose a teacher-provided PDF below when you want to study from a specific material.`
        : `Hello ${firstName}! Your recent AIcee chat history will appear here. Ask me about any lesson, or choose a teacher-provided PDF below so I can guide you using that learning material.`;

    chat.appendChild(greeting);

    if (!currentConversationId) {
        try {
            const res = await fetch("/ai/conversations");
            const data = await res.json();
            if (res.ok && data.success && Array.isArray(data.conversations) && data.conversations.length > 0) {
                currentConversationId = data.conversations[0].id;
            }
        } catch (e) {
            console.warn("Could not fetch active conversation:", e);
        }
    }

    if (currentConversationId) {
        await loadAIChatHistory(currentConversationId);
    }
    chat.scrollTop = chat.scrollHeight;

    const input = document.getElementById("ai-input");
    setTimeout(() => input?.focus(), 180);

await loadConversationsList();
}

async function sendAIMessage() {
    const input = document.getElementById("ai-input");

    if (
        !input ||
        input.disabled ||
        !input.value.trim()
    ) {
        return;
    }

    const chat = document.getElementById("ai-chat-log");
    if (!chat) return;

    const question = input.value.trim();
    const select = document.getElementById("ai-module-select");

    const moduleId =
        select?.value
            ? Number(select.value)
            : null;

    const selectedMaterial =
        Array.isArray(aiLearningMaterials)
            ? aiLearningMaterials.find(
                item =>
                    Number(item.id) ===
                    Number(moduleId)
            )
            : null;

    // Gumawa muna ng bagong conversation sa backend kung wala pa
    if (!currentConversationId) {
        try {
            const createRes = await fetch("/ai/conversations", {
                method: "POST",
                headers: { "Content-Type": "application/json" }
            });
            const createData = await createRes.json();
            if (createRes.ok && createData.success && createData.conversation) {
                currentConversationId = createData.conversation.id;
            } else {
                throw new Error("Could not start a new conversation session.");
            }
        } catch (err) {
            console.error("Conversation creation error:", err);
            appendAIChatMessage("model", "Sorry, could not initialize chat session. Please try again.", { fallback: true });
            return;
        }
    }

    appendAIChatMessage(
        "user",
        question,
        {
            moduleTitle:
                selectedMaterial?.title || null
        }
    );

    input.value = "";
    chat.scrollTop = chat.scrollHeight;

    setAIceeComposerBusy(true);

    const thinkingIndicator =
        showAIceeThinkingIndicator(
            selectedMaterial
        );

    try {
        const response =
            await fetch(
                "/chat",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            message: question,
                            userId: currentUser.id,
                            conversationId: currentConversationId,
                            moduleId: moduleId
                        })
                }
            );

        let data;

        try {
            data = await response.json();
        } catch (jsonError) {
            throw new Error(
                "AIcee returned an invalid server response."
            );
        }

        thinkingIndicator?.remove();

        if (!response.ok) {
            throw new Error(
                data?.message ||
                data?.reply ||
                "AIcee request failed."
            );
        }

        if (data.warning) {
            appendAIChatMessage(
                "model",
                data.warning,
                {
                    warning: true
                }
            );
        }

        appendAIChatMessage(
            "model",

            String(
                data.reply ||
                "AIcee did not return a response."
            ),

            {
                fallback:
                    Boolean(data.fallback)
            }
        );

        chat.scrollTop =
            chat.scrollHeight;

    } catch (error) {
        thinkingIndicator?.remove();

        console.error(
            "AIcee message error:",
            error
        );

        appendAIChatMessage(
            "model",

            error?.message &&
            !String(error.message)
                .includes("Failed to fetch")
                ? `Sorry, something went wrong: ${error.message}`
                : "Sorry, AIcee is currently unavailable. Please try again in a moment.",

            {
                fallback: true
            }
        );

        chat.scrollTop =
            chat.scrollHeight;

    } finally {
        thinkingIndicator?.remove();
        setAIceeComposerBusy(false);

        input.focus();
    }
}

async function showUploadModal() {

    if (currentRole !== "teacher") {
        showLegacyAlert("Only teachers can upload modules.");
        return;
    }

    const modal = document.getElementById("upload-modal");

    if (!modal) {
        console.error("upload-modal not found");
        return;
    }

    modal.classList.remove("hidden");

    await loadSections();
}

function closeUploadModal() {
    const modal = document.getElementById('upload-modal');
    if (modal) modal.classList.add('hidden');
}

async function showAssignmentModal() {

    if (currentRole !== "teacher") {

        showLegacyAlert(
            "Only teachers can create assignments."
        );

        return;
    }

    const modal =
        document.getElementById(
            "assignment-modal"
        );

    if (!modal) return;

    modal.classList.remove(
        "hidden"
    );

    await Promise.all([
        loadAssignmentSections(),
        loadAssignmentModules()
    ]);

}


function closeAssignmentModal() {

    const modal =
        document.getElementById(
            "assignment-modal"
        );

    if (modal) {
        modal.classList.add(
            "hidden"
        );
    }

}

function escapeHTML(value) {

    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}

function formatAssignmentDate(dateValue) {

    if (!dateValue) {
        return "No due date";
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return String(dateValue);
    }

    return date.toLocaleString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

let selectedAssignmentForSubmission = null;


function viewAssignment(assignmentId) {

    const assignment =
        assignmentsList.find(
            item =>
                Number(item.id) ===
                Number(assignmentId)
        );

    if (!assignment) {

        showMessagePopup(
            "Assignment Not Found",
            "This assignment could not be found.",
            "error"
        );

        return;
    }

    /*
        Teacher: view details only.
    */

    if (currentRole === "teacher") {

        showMessagePopup(
            assignment.title,
            `${assignment.description || "No instructions provided."}

Due: ${formatAssignmentDate(assignment.due_date)}

Sections: ${assignment.assigned_sections || "No sections available."}`,
            "success"
        );

        return;
    }

    /*
        Student: open submission modal.
    */

    selectedAssignmentForSubmission =
        assignment;

    const modal =
        document.getElementById(
            "assignment-submission-modal"
        );

    const title =
        document.getElementById(
            "submission-assignment-title"
        );

    const description =
        document.getElementById(
            "submission-assignment-description"
        );

    const due =
        document.getElementById(
            "submission-assignment-due"
        );

    const answer =
        document.getElementById(
            "assignment-answer-text"
        );

    const fileInput =
        document.getElementById(
            "assignment-submission-file"
        );

    const message =
        document.getElementById(
            "assignment-submission-message"
        );

    if (
        !modal ||
        !title ||
        !description ||
        !due
    ) {

        console.error(
            "Assignment submission modal elements are missing."
        );

        return;
    }

    title.textContent =
        assignment.title;

    description.textContent =
        assignment.description ||
        "No instructions provided.";

    due.textContent =
        `Due: ${formatAssignmentDate(
            assignment.due_date
        )}`;

    if (answer) {
        answer.value = "";
    }

    if (fileInput) {
        fileInput.value = "";
    }

    if (message) {
        message.textContent = "";
    }

    modal.classList.remove("hidden");

}


function closeAssignmentSubmissionModal() {

    const modal =
        document.getElementById(
            "assignment-submission-modal"
        );

    if (modal) {
        modal.classList.add("hidden");
    }

    selectedAssignmentForSubmission =
        null;

}


async function submitAssignmentWork(event) {

    event.preventDefault();

    if (!selectedAssignmentForSubmission) {

        showMessagePopup(
            "Submission Error",
            "No assignment was selected.",
            "error"
        );

        return;
    }

    const answerInput =
        document.getElementById(
            "assignment-answer-text"
        );

    const fileInput =
        document.getElementById(
            "assignment-submission-file"
        );

    const message =
        document.getElementById(
            "assignment-submission-message"
        );

    const submitButton =
        document.getElementById(
            "assignment-submission-button"
        );

    const answerText =
        answerInput
            ? answerInput.value.trim()
            : "";

    const selectedFile =
        fileInput &&
        fileInput.files.length > 0
            ? fileInput.files[0]
            : null;

    if (!answerText && !selectedFile) {

        if (message) {

            message.textContent =
                "Please enter an answer or attach a file.";

            message.className =
                "text-sm text-center min-h-[20px] text-red-600";

        }

        return;
    }

    const formData =
        new FormData();

    formData.append(
        "assignment_id",
        selectedAssignmentForSubmission.id
    );

    formData.append(
        "student_id",
        currentUser.id
    );

    formData.append(
        "answer_text",
        answerText
    );

    if (selectedFile) {

        formData.append(
            "file",
            selectedFile
        );

    }

    if (submitButton) {

        submitButton.disabled = true;

        submitButton.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            Submitting...
        `;

    }

    if (message) {
        message.textContent = "";
    }

    try {

        const response = await fetch(
            "/assignment-submissions",
            {
                method: "POST",
                body: formData
            }
        );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Assignment submission failed."
            );

        }

        closeAssignmentSubmissionModal();

        showMessagePopup(
            "Assignment Submitted",
            "Your work was submitted successfully. Your teacher can now review it.",
            "success"
        );

        await loadAssignments();

    } catch (error) {

        console.error(
            "Submit assignment error:",
            error
        );

        if (message) {

            message.textContent =
                error.message;

            message.className =
                "text-sm text-center min-h-[20px] text-red-600";

        }

    } finally {

        if (submitButton) {

            submitButton.disabled = false;

            submitButton.innerHTML = `
                <i class="fa-solid fa-paper-plane"></i>
                Submit Work
            `;

        }

    }

}

async function loadAssignmentSections() {

    const container =
        document.getElementById(
            "assignment-section-list"
        );

    if (!container) {
        console.error(
            "assignment-section-list not found"
        );
        return;
    }

    container.innerHTML =
        `<p class="text-sm text-gray-500">Loading sections...</p>`;

    try {

        console.log(
            "Loading sections for teacher:",
            currentUser.id
        );

        const response = await fetch(
            `/sections?teacher_id=${currentUser.id}`
        );

        console.log(
            "Sections HTTP status:",
            response.status
        );

        const sections =
            await response.json();

        console.log(
            "Sections received:",
            sections
        );

        if (!response.ok) {
            throw new Error(
                sections.message ||
                "Failed to load sections."
            );
        }

        if (!Array.isArray(sections)) {
            throw new Error(
                "Sections response is not an array."
            );
        }

        container.innerHTML = "";

        if (sections.length === 0) {

            container.innerHTML = `
                <p class="text-sm text-gray-500">
                    No sections assigned to this teacher.
                </p>
            `;

            return;
        }

        sections.forEach(section => {

            const label =
                document.createElement(
                    "label"
                );

            label.className =
                "flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-blue-50";

            label.innerHTML = `
                <input
                    type="checkbox"
                    class="assignment-section-checkbox"
                    value="${section.id}"
                >

                <span class="text-sm text-gray-700">
                    ${section.section_name}
                </span>
            `;

            container.appendChild(label);

        });

    } catch (error) {

        console.error(
            "Assignment sections error:",
            error
        );

        container.innerHTML = `
            <p class="text-sm text-red-600">
                Failed to load sections:
                ${error.message}
            </p>
        `;

    }

}

async function loadAssignmentModules() {

    const select =
        document.getElementById(
            "assignment-module"
        );

    if (!select) return;

    select.innerHTML = `
        <option value="">
            No related module
        </option>
    `;

    try {

        const response = await fetch(
            `/dashboard/${currentUser.id}`
        );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Failed to load modules."
            );

        }

        const modules =
            data.modules || [];

        modules.forEach(module => {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                module.id;

            option.textContent =
                module.title;

            select.appendChild(
                option
            );

        });

    } catch (error) {

        console.error(
            "Assignment modules error:",
            error
        );

    }

}

    async function createAssignment(event) {
        

    event.preventDefault();

    const titleInput =
        document.getElementById(
            "assignment-title"
        );

    const descriptionInput =
        document.getElementById(
            "assignment-description"
        );

    const moduleSelect =
        document.getElementById(
            "assignment-module"
        );

    const dueDateInput =
        document.getElementById(
            "assignment-due-date"
        );

    const title =
        titleInput.value.trim();

    const description =
        descriptionInput.value.trim();

    const moduleId =
        moduleSelect.value;

    const dueDate =
        dueDateInput.value;

    const selectedSections =
        Array.from(
            document.querySelectorAll(
                ".assignment-section-checkbox:checked"
            )
        ).map(
            checkbox =>
                Number(checkbox.value)
        );

    if (!title) {

        showLegacyAlert(
            "Please enter an assignment title."
        );

        return;
    }

    if (!dueDate) {

        showLegacyAlert(
            "Please select a due date."
        );

        return;
    }

    if (
        selectedSections.length === 0
    ) {

        showLegacyAlert(
            "Please select at least one section."
        );

        return;
    }

    const submitButton =
        document.getElementById(
            "create-assignment-submit"
        );

    if (submitButton) {

        submitButton.disabled = true;

        submitButton.textContent =
            "Creating...";

    }

    try {

        const response = await fetch(
            "/assignments",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    title: title,
                    description: description,

                    module_id:
                        moduleId
                            ? Number(moduleId)
                            : null,

                    teacher_id:
                        currentUser.id,

                    due_date:
                        dueDate,

                    sections:
                        selectedSections
                })
            }
        );

        const data =
            await response.json();

        console.log(
            "Create assignment response:",
            data
        );

        if (
            !response.ok ||
            !data.success
        ) {

            showLegacyAlert(
                "❌ " +
                (
                    data.message ||
                    "Assignment creation failed."
                )
            );

            return;
        }

        showLegacyAlert(
            "✅ Assignment created successfully!"
        );

        const form =
            document.getElementById(
                "assignment-form"
            );

        if (form) {
            form.reset();
        }

        closeAssignmentModal();

        await loadAssignments();

    } catch (error) {

        console.error(
            "Create assignment error:",
            error
        );

        showLegacyAlert(
            "❌ Cannot connect to the server."
        );

    } finally {

        if (submitButton) {

            submitButton.disabled =
                false;

            submitButton.textContent =
                "Create Assignment";

        }

    }

}

async function loadAssignments() {

    const container =
        document.getElementById(
            "assignments-list"
        );

    if (container) {

        container.innerHTML = `
            <div class="bg-white border rounded-3xl p-8 text-gray-500">
                Loading assignments...
            </div>
        `;

    }

    try {

        let endpoint;

        if (currentRole === "teacher") {

            endpoint =
                `/assignments/teacher/${currentUser.id}`;

        } else {

            endpoint =
                `/assignments/student/${currentUser.id}`;

        }

        const response =
            await fetch(endpoint);

        const data =
            await response.json();

        console.log(
            "Assignments response:",
            data
        );

        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Assignments failed to load."
            );

        }

        assignmentsList =
            data.assignments || [];

        populateAssignments();

    } catch (error) {

        console.error(
            "Load assignments error:",
            error
        );

        assignmentsList = [];

        if (container) {

            container.innerHTML = `
                <div class="bg-red-50 text-red-600 rounded-3xl p-8">
                    Failed to load assignments.
                </div>
            `;

        }

    }

}

async function loadSections() {

    const container = document.getElementById("section-list");

    if (!container) {
        console.error("section-list not found");
        return;
    }

    container.innerHTML =
        `<p class="text-sm text-gray-500">Loading sections...</p>`;

    try {

        const response = await fetch(
            `/sections?teacher_id=${currentUser.id}`
        );

        const sections = await response.json();

        if (!response.ok) {
            throw new Error(
                sections.message || "Failed to load sections."
            );
        }

        if (!Array.isArray(sections)) {
            throw new Error("Sections response is not an array.");
        }

        container.innerHTML = "";

        if (sections.length === 0) {
            container.innerHTML = `
                <p class="text-sm text-gray-500">
                    No sections assigned to this teacher.
                </p>
            `;
            return;
        }

        sections.forEach(section => {
            const label = document.createElement("label");

            label.className =
                "flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-blue-50";

            label.innerHTML = `
                <input
                    type="checkbox"
                    class="section-checkbox"
                    value="${section.id}"
                >

                <span class="text-sm text-gray-700">
                    ${escapeHTML(section.section_name)}
                </span>
            `;

            container.appendChild(label);
        });

    } catch (error) {

        console.error("Load sections error:", error);

        container.innerHTML = `
            <p class="text-sm text-red-600">
                Failed to load sections: ${escapeHTML(error.message)}
            </p>
        `;
    }
}

async function fakeUpload(){

    const fileInput = document.getElementById("module-file");

    const title = document.getElementById("module-title").value;
    const description = document.getElementById("module-description").value;


    const formData = new FormData();

    formData.append("file", fileInput.files[0]);
    formData.append("title", title);
    formData.append("description", description);
    formData.append("teacher_id", currentUser.id);
    
    const selectedSections = document.querySelectorAll(".section-checkbox:checked");

selectedSections.forEach(section => {

    formData.append("sections", section.value);

});



    try{

        const response = await fetch(
            "/upload-module",
            {
                method:"POST",
                body:formData
            }
        );


        const data = await response.json();


        if(data.success){

           showMessagePopup(
    "Module Uploaded",
    "The learning module was uploaded successfully.",
    "success"
);
        }


    }catch(error){

        console.error(error);

       showMessagePopup(
    "Upload Failed",
    "The module could not be uploaded. Please try again.",
    "error"
);

    }

}

function viewModule(file) {

    if (!file) {
        showLegacyAlert("No file attached to this module.");
        return;
    }

    window.open(
        `/uploads/${file}`,
        "_blank"
    );

}


async function openStudentModule(file, moduleId, currentProgress) {

    viewModule(file);

    const numericProgress = Number(currentProgress) || 0;

    const newProgress =
        numericProgress < 25
            ? 25
            : numericProgress;

    if (newProgress !== numericProgress) {

        await updateModuleProgress(
            moduleId,
            newProgress
        );

    }

}


async function completeModule(moduleId) {

    const confirmed =
        await showConfirmPopup({
            title: "Complete Module?",
            message:
                "This module will be marked as completed.",
            confirmText: "Mark Complete",
            cancelText: "Cancel",
            type: "info"
        });

    if (!confirmed) {
        return;
    }

    await updateModuleProgress(
        moduleId,
        100
    );

}


async function updateModuleProgress(moduleId, progress) {

    try {

        const response = await fetch(
            "/module-progress",
            {
                method: "PUT",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    student_id: currentUser.id,
                    module_id: moduleId,
                    progress: progress
                })
            }
        );

        const data = await response.json();

        console.log(
            "Progress response:",
            data
        );

        if (!response.ok || !data.success) {

            showLegacyAlert(
                "❌ " +
                (
                    data.message ||
                    "Progress update failed."
                )
            );

            return;

        }

        await loadDashboard();

    } catch (error) {

        console.error(
            "Progress update error:",
            error
        );

        showLegacyAlert(
            "❌ Cannot connect to the server."
        );

    }

}

function animatePage(element) {
    if (!element) return;

    element.classList.remove("page-enter");

    const children =
        Array.from(element.children || []);

    children.forEach((child, index) => {
        child.classList.remove(
            "aicee-stagger-item"
        );

        child.style.setProperty(
            "--aicee-stagger-delay",
            `${Math.min(index, 10) * 45}ms`
        );

        child.classList.add(
            "aicee-stagger-item"
        );
    });

    void element.offsetWidth;

    element.classList.add("page-enter");
}

async function showProfileMenu() {
    await navigateTo("profile");
}

function closeMobileSidebar() {

    const sidebar =
        document.getElementById("sidebar");

    const overlay =
        document.getElementById(
            "mobile-sidebar-overlay"
        );

    if (sidebar) {
        sidebar.classList.add(
            "-translate-x-full"
        );
    }

    if (overlay) {
        overlay.classList.add("hidden");
    }
}


function toggleMobileSidebar() {

    const sidebar =
        document.getElementById("sidebar");

    const overlay =
        document.getElementById(
            "mobile-sidebar-overlay"
        );

    if (!sidebar || !overlay) {
        return;
    }

    const isClosed =
        sidebar.classList.contains(
            "-translate-x-full"
        );

    if (isClosed) {
        sidebar.classList.remove(
            "-translate-x-full"
        );
        overlay.classList.remove("hidden");
    } else {
        closeMobileSidebar();
    }
}


async function loadTeacherStudentProgress() {

    const container = document.getElementById(
        "teacher-students-list"
    );

    if (!container) return;

    container.innerHTML = `
        <div class="bg-white border rounded-3xl p-6">
            Loading student progress...
        </div>
    `;

    try {

        const response = await fetch(
            `/teacher-student-progress/${currentUser.id}`
        );

        const data = await response.json();

        if (!response.ok || !data.success) {

            container.innerHTML = `
                <div class="bg-red-50 text-red-600 rounded-3xl p-6">
                    ${
                        data.message ||
                        "Failed to load students."
                    }
                </div>
            `;

            return;

        }

        const rows = data.students || [];

        if (rows.length === 0) {

            container.innerHTML = `
                <div class="bg-white border rounded-3xl p-8 text-center text-gray-500">
                    No student progress found yet.
                </div>
            `;

            return;

        }

        const sections = {};

        rows.forEach(row => {

            if (!sections[row.section_name]) {
                sections[row.section_name] = {};
            }

            if (
                !sections[row.section_name][
                    row.student_id
                ]
            ) {
                sections[row.section_name][
                    row.student_id
                ] = {
                    name: row.student_name,
                    modules: []
                };
            }

            sections[row.section_name][
                row.student_id
            ].modules.push({
                title: row.module_title,
                progress:
                    Number(row.progress) || 0
            });

        });

        container.innerHTML = "";

        Object.entries(sections).forEach(
            ([sectionName, students]) => {

                const sectionCard =
                    document.createElement("div");

                sectionCard.className =
                    "bg-white border border-gray-100 rounded-3xl p-6";

                let studentsHTML = "";

                Object.values(students).forEach(
                    student => {

                        let modulesHTML = "";

                        student.modules.forEach(
                            module => {

                                modulesHTML += `
                                    <div class="mt-4">
                                        <div class="flex justify-between text-sm mb-2">

                                            <span class="text-gray-700">
                                                ${module.title}
                                            </span>

                                            <span class="font-semibold">
                                                ${module.progress}%
                                            </span>

                                        </div>

                                        <div class="h-2 bg-gray-100 rounded-full overflow-hidden">

                                            <div
                                                class="h-2 bg-blue-600 rounded-full"
                                                style="width: ${module.progress}%">
                                            </div>

                                        </div>
                                    </div>
                                `;

                            }
                        );

                        studentsHTML += `
                            <div class="border-t first:border-t-0 py-5 first:pt-0">

                                <h4 class="font-semibold text-gray-900">
                                    ${student.name}
                                </h4>

                                ${modulesHTML}

                            </div>
                        `;

                    }
                );

                sectionCard.innerHTML = `
                    <h3 class="text-lg font-bold text-blue-600 mb-5">
                        ${sectionName}
                    </h3>

                    ${studentsHTML}
                `;

                container.appendChild(
                    sectionCard
                );

            }
        );

    } catch (error) {

        console.error(
            "Student progress error:",
            error
        );

        container.innerHTML = `
            <div class="bg-red-50 text-red-600 rounded-3xl p-6">
                Cannot connect to the server.
            </div>
        `;

    }

}

async function checkDiagnosticQuiz() {
    if (
        currentRole !== "student" ||
        !currentUser?.id
    ) {
        return;
    }

    /*
        diagnostic_completed means the student has completed
        at least one diagnostic. It does NOT permanently disable
        future weekly diagnostics.
    */
    await loadDiagnosticProfileData();

    if (!diagnosticStatus.can_take) {
        return;
    }

    const recurring =
        diagnosticStatus.has_completed;

    const accepted =
        await showConfirmPopup({
            title:
                recurring
                    ? "Your Weekly Diagnostic Is Ready"
                    : "Set Up Your Learning Profile?",

            message:
                recurring
                    ? "A new ungraded diagnostic is available. This week's questions are rotated so AIcee can update your learning profile using fresh evidence."
                    : "Would you like to take a short, ungraded diagnostic assessment? Your answers will help AIcee identify your current strengths and areas that may need more review.",

            confirmText:
                recurring
                    ? "Take Weekly Diagnostic"
                    : "Take the Quiz",

            cancelText:
                "Maybe Later",

            type:
                "quiz"
        });

    if (accepted) {
        await loadDiagnosticQuiz();
    }
}


async function loadDiagnosticQuiz() {
    const modal = document.getElementById(
        "diagnostic-modal"
    );

    const container = document.getElementById(
        "diagnostic-questions-container"
    );

    if (!modal || !container) return;

    currentDiagnosticSetToken = "";

    modal.classList.remove("hidden");

    container.innerHTML = `
        <p class="text-gray-500">
            Preparing this week's diagnostic questions...
        </p>
    `;

    try {
        const response = await fetch(
            "/diagnostic-questions"
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            if (
                data.code ===
                "DIAGNOSTIC_COOLDOWN"
            ) {
                const next =
                    data.next_available_at
                        ? new Date(
                            data.next_available_at
                        ).toLocaleString()
                        : "later";

                container.innerHTML = `
                    <div class="rounded-2xl bg-amber-50 border border-amber-100 p-5 text-amber-700">
                        Your next diagnostic will be available on ${next}.
                    </div>
                `;

                await loadDiagnosticProfileData();
                return;
            }

            container.innerHTML = `
                <p class="text-red-600">
                    ${
                        data.message ||
                        "Failed to load questions."
                    }
                </p>
            `;

            return;
        }

        const questions =
            Array.isArray(data.questions)
                ? data.questions
                : [];

        currentDiagnosticSetToken =
            String(
                data.diagnostic_set_token ||
                ""
            );

        if (
            !questions.length ||
            !currentDiagnosticSetToken
        ) {
            container.innerHTML = `
                <p class="text-red-600">
                    A valid diagnostic question set could not be prepared.
                </p>
            `;

            return;
        }

        const warningSubjects =
            Array.isArray(
                data.rotation_warning_subjects
            )
                ? data.rotation_warning_subjects
                : [];

        container.innerHTML = `
            <div class="diagnostic-info-card rounded-2xl bg-blue-50 border border-blue-100 p-4 mb-5 text-sm text-blue-700">
                <strong>Fresh weekly set:</strong>
                AIcee prioritizes questions you have not answered before and avoids questions from your immediately previous diagnostic whenever the question bank allows it.

                ${
                    warningSubjects.length
                        ? `
                            <div class="mt-2 text-amber-700">
                                Some subjects need a larger question bank to guarantee zero immediate repeats:
                                ${warningSubjects.join(", ")}.
                            </div>
                        `
                        : ""
                }
            </div>
        `;

        questions.forEach(
            (question, index) => {
                const questionCard =
                    document.createElement(
                        "div"
                    );

                questionCard.className =
                    "diagnostic-question-card border border-gray-200 rounded-3xl p-6";

                questionCard.innerHTML = `
                    <p class="text-xs uppercase tracking-widest text-blue-600 font-semibold">
                        ${question.subject}
                    </p>

                    <h3 class="font-semibold text-gray-900 mt-2 mb-5">
                        ${index + 1}. ${question.question}
                    </h3>

                    <div class="space-y-3">
                        ${createDiagnosticOption(
                            question.id,
                            "A",
                            question.option_a
                        )}

                        ${createDiagnosticOption(
                            question.id,
                            "B",
                            question.option_b
                        )}

                        ${createDiagnosticOption(
                            question.id,
                            "C",
                            question.option_c
                        )}

                        ${createDiagnosticOption(
                            question.id,
                            "D",
                            question.option_d
                        )}
                    </div>
                `;

                container.appendChild(
                    questionCard
                );
            }
        );
    } catch (error) {
        console.error(
            "Diagnostic load error:",
            error
        );

        container.innerHTML = `
            <p class="text-red-600">
                Cannot connect to the server.
            </p>
        `;
    }
}


function createDiagnosticOption(
    questionId,
    optionLetter,
    optionText
) {

    return `
        <label class="flex items-center gap-3 border border-gray-200 rounded-2xl p-4 cursor-pointer hover:bg-blue-50">

            <input
                type="radio"
                name="question-${questionId}"
                value="${optionLetter}"
                class="diagnostic-answer"
                data-question-id="${questionId}"
            >

            <span class="font-semibold">
                ${optionLetter}.
            </span>

            <span>
                ${optionText}
            </span>

        </label>
    `;

}

async function submitDiagnosticQuiz(event) {
    event.preventDefault();

    const answerInputs =
        document.querySelectorAll(
            ".diagnostic-answer:checked"
        );

    const questionCards =
        document.querySelectorAll(
            "#diagnostic-questions-container .diagnostic-question-card"
        );

    if (
        answerInputs.length !==
        questionCards.length
    ) {
        showMessagePopup(
            "Incomplete Quiz",
            "Please answer every question before submitting your diagnostic quiz.",
            "warning"
        );

        return;
    }

    if (!currentDiagnosticSetToken) {
        showMessagePopup(
            "Diagnostic Set Expired",
            "Please reopen the diagnostic assessment to get a fresh question set.",
            "warning"
        );

        return;
    }

    const answers =
        Array.from(
            answerInputs
        ).map(input => ({
            question_id:
                Number(
                    input.dataset.questionId
                ),

            selected_option:
                input.value
        }));

    try {
        const response = await fetch(
            "/diagnostic-submit",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    student_id:
                        currentUser.id,

                    diagnostic_set_token:
                        currentDiagnosticSetToken,

                    answers
                })
            }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
            if (
                data.code ===
                    "DIAGNOSTIC_COOLDOWN" ||
                data.code ===
                    "DIAGNOSTIC_SET_EXPIRED"
            ) {
                currentDiagnosticSetToken = "";

                showMessagePopup(
                    "Diagnostic Not Available",
                    data.message ||
                        "Please reopen the diagnostic assessment.",
                    "warning"
                );

                await loadDiagnosticProfileData();
                return;
            }

            showLegacyAlert(
                "❌ " +
                (
                    data.message ||
                    "Diagnostic submission failed."
                )
            );

            return;
        }

        currentDiagnosticSetToken = "";

        /*
            This flag now means "has completed at least
            one diagnostic", not "never take another one".
        */
        currentUser.diagnostic_completed = 1;

        currentUser.role =
            String(
                currentUser.role
            ).toLowerCase();

        localStorage.setItem(
            "user",
            JSON.stringify(currentUser)
        );

        document
            .getElementById(
                "diagnostic-modal"
            )
            ?.classList.add("hidden");

        const results =
            Array.isArray(data.results)
                ? data.results
                : [];

        const totalCorrect =
            results.reduce(
                (sum, result) =>
                    sum +
                    Number(
                        result.score || 0
                    ),
                0
            );

        const totalQuestions =
            results.reduce(
                (sum, result) =>
                    sum +
                    Number(
                        result.total_questions ||
                        0
                    ),
                0
            );

        const overallPercentage =
            totalQuestions > 0
                ? Math.round(
                    (
                        totalCorrect /
                        totalQuestions
                    ) * 100
                )
                : 0;

        const subjectScores =
            results
                .map(
                    result =>
                        `${result.subject}: ` +
                        `${result.score}/${result.total_questions} ` +
                        `(${result.percentage}%)`
                )
                .join("\n");

        const nextText =
            data.next_available_at
                ? `

Next weekly diagnostic:
${new Date(
    data.next_available_at
).toLocaleString()}`
                : "";

        showMessagePopup(
            "Diagnostic Quiz Results",
            `Overall Score: ${totalCorrect}/${totalQuestions} (${overallPercentage}%)

${subjectScores}

AIcee will use these results to update your learning profile.${nextText}`,
            "success"
        );

        await loadDashboard();
        await loadDiagnosticProfileData();

        navigateTo("dashboard");

        console.log(
            "Diagnostic results:",
            data.results
        );
    } catch (error) {
        console.error(
            "Diagnostic submit error:",
            error
        );

        showLegacyAlert(
            "❌ Cannot connect to the server."
        );
    }
}


async function skipDiagnosticQuiz() {
    const confirmed =
        await showConfirmPopup({
            title: "Skip Diagnostic Quiz?",
            message:
                "You can answer this later, but AIcee may not be able to fully personalize your learning experience yet.",
            confirmText: "Skip for Now",
            cancelText: "Continue Quiz",
            type: "warning"
        });

    if (!confirmed) {
        return;
    }

    currentDiagnosticSetToken = "";

    const modal = document.getElementById(
        "diagnostic-modal"
    );

    if (modal) {
        modal.classList.add("hidden");
    }
}


async function openDiagnosticQuiz() {
    await loadDiagnosticProfileData();

    if (!diagnosticStatus.can_take) {
        const next =
            diagnosticStatus.next_available_at
                ? new Date(
                    diagnosticStatus.next_available_at
                ).toLocaleString()
                : "later";

        showMessagePopup(
            "Next Diagnostic Not Yet Available",
            `Your learning profile is up to date. Your next diagnostic will be available on ${next}.`,
            "warning"
        );

        return;
    }

    const accepted =
        await showConfirmPopup({
            title:
                diagnosticStatus.has_completed
                    ? "Take Weekly Diagnostic?"
                    : "Take Diagnostic Assessment?",

            message:
                diagnosticStatus.has_completed
                    ? "This week's assessment uses a rotated question set and is not graded. The results will update your diagnostic history and AIcee learning profile."
                    : "This assessment is not graded. Its results will create your initial AIcee learning profile.",

            confirmText:
                "Start Assessment",

            cancelText:
                "Not Now",

            type:
                "quiz"
        });

    if (accepted) {
        await loadDiagnosticQuiz();
    }
}


/* =========================================
   ADMIN CONTROL CENTER
========================================= */

let adminAccountsCache = [];
let adminSectionsCache = [];

function adminEscape(value) {
    return escapeHTML(String(value ?? ""));
}

async function loadAdminOverview() {
    if (currentRole !== "admin") return;

    const dbStatus = document.getElementById("admin-db-status");

    try {
        if (dbStatus) {
            dbStatus.innerHTML = '<span class="w-2 h-2 bg-amber-500 rounded-full"></span> Database Checking';
            dbStatus.className = "inline-flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-2xl text-sm font-semibold";
        }

        const response = await fetch("/admin/overview");
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || "Failed to load admin dashboard.");
        }

        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = String(value ?? 0);
        };

        setText("admin-total-students", data.stats?.students || 0);
        setText("admin-total-teachers", data.stats?.teachers || 0);
        setText("admin-total-sections", data.stats?.sections || 0);
        setText("admin-ai-profiles-ready", data.stats?.ai_profiles_ready || 0);

        if (dbStatus) {
            dbStatus.innerHTML = '<span class="w-2 h-2 bg-blue-500 rounded-full"></span> Database Connected';
            dbStatus.className = "inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-2xl text-sm font-semibold";
        }
    } catch (error) {
        console.error("Admin overview error:", error);
        if (dbStatus) {
            dbStatus.innerHTML = '<span class="w-2 h-2 bg-red-500 rounded-full"></span> Database Error';
            dbStatus.className = "inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-2xl text-sm font-semibold";
        }
    }
}

async function loadAdminAccounts() {
    if (currentRole !== "admin") return [];

    try {
        const response = await fetch("/admin/accounts");
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || "Failed to load accounts.");
        }

        adminAccountsCache = Array.isArray(data.accounts) ? data.accounts : [];
        renderAdminAccounts();
        populateAdminTeacherOptions();
        return adminAccountsCache;
    } catch (error) {
        console.error("Admin accounts error:", error);
        const list = document.getElementById("admin-accounts-list");
        if (list) {
            list.innerHTML = `<div class="rounded-2xl bg-red-50 text-red-700 p-5 text-sm">${adminEscape(error.message)}</div>`;
        }
        return [];
    }
}

function renderAdminAccounts() {
    const list = document.getElementById("admin-accounts-list");
    if (!list) return;

    const search = String(document.getElementById("admin-account-search")?.value || "").trim().toLowerCase();
    const roleFilter = String(document.getElementById("admin-account-role-filter")?.value || "all").toLowerCase();

    const accounts = adminAccountsCache.filter(account => {
        const role = String(account.role || "").toLowerCase();
        if (role === "admin") return false;
        if (roleFilter !== "all" && role !== roleFilter) return false;

        if (!search) return true;
        const haystack = [account.name, account.email, account.section_name, role].join(" ").toLowerCase();
        return haystack.includes(search);
    });

    if (accounts.length === 0) {
        list.innerHTML = '<div class="text-sm text-gray-500 text-center py-12">No matching accounts.</div>';
        return;
    }

    list.innerHTML = accounts.map(account => {
        const isStudent = String(account.role).toLowerCase() === "student";
        const diagnosticReady = Number(account.diagnostic_completed) === 1;
        return `
            <div class="rounded-2xl border border-gray-100 p-5 flex flex-col lg:flex-row lg:items-center gap-4 hover:border-blue-100 transition-colors">
                <div class="w-12 h-12 rounded-2xl ${isStudent ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600"} flex items-center justify-center shrink-0">
                    <i class="fa-solid ${isStudent ? "fa-user-graduate" : "fa-chalkboard-user"}"></i>
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                        <h3 class="font-semibold text-gray-900 truncate">${adminEscape(account.name)}</h3>
                        <span class="px-2.5 py-1 rounded-full text-[11px] font-bold ${isStudent ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"}">${adminEscape(account.role)}</span>
                        ${isStudent ? `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold ${diagnosticReady ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}">${diagnosticReady ? "AI profile ready" : "Diagnostic pending"}</span>` : ""}
                    </div>
                    <p class="text-sm text-gray-500 mt-1 break-all">${adminEscape(account.email)}</p>
                    <p class="text-xs text-gray-400 mt-2">${isStudent ? `Section: ${adminEscape(account.section_name || "Unassigned")}` : "Teacher account"}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button type="button" onclick="openAdminAccountModal(${Number(account.id)})" class="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-semibold"><i class="fa-regular fa-pen-to-square mr-1"></i>Edit</button>
                    <button type="button" onclick="openAdminResetModal(${Number(account.id)})" class="px-4 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm font-semibold"><i class="fa-solid fa-key mr-1"></i>Reset Password</button>
                </div>
            </div>`;
    }).join("");
}

async function loadAdminSections() {
    if (currentRole !== "admin") return [];

    try {
        const response = await fetch("/admin/sections");
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || "Failed to load sections.");
        }

        adminSectionsCache = Array.isArray(data.sections) ? data.sections : [];
        populateAdminSectionOptions();
        renderAdminSections();
        return adminSectionsCache;
    } catch (error) {
        console.error("Admin sections error:", error);
        const list = document.getElementById("admin-sections-list");
        if (list) list.innerHTML = `<div class="aicee-panel p-6 text-red-700">${adminEscape(error.message)}</div>`;
        return [];
    }
}

function populateAdminSectionOptions() {
    const select = document.getElementById("admin-account-section");
    if (!select) return;

    const current = select.value;
    select.innerHTML = '<option value="">Select section</option>' + adminSectionsCache.map(section =>
        `<option value="${Number(section.id)}">${adminEscape(section.section_name)}</option>`
    ).join("");
    if ([...select.options].some(option => option.value === current)) select.value = current;
}

function populateAdminTeacherOptions() {
    const select = document.getElementById("admin-section-teacher");
    if (!select) return;

    const current = select.value;
    const teachers = adminAccountsCache.filter(account => String(account.role).toLowerCase() === "teacher");
    select.innerHTML = '<option value="">Select teacher</option>' + teachers.map(teacher =>
        `<option value="${Number(teacher.id)}">${adminEscape(teacher.name)} — ${adminEscape(teacher.email)}</option>`
    ).join("");
    if ([...select.options].some(option => option.value === current)) select.value = current;
}

function renderAdminSections() {
    const list = document.getElementById("admin-sections-list");
    if (!list) return;

    if (adminSectionsCache.length === 0) {
        list.innerHTML = '<div class="aicee-panel p-6 text-gray-500">No sections created yet.</div>';
        return;
    }

    list.innerHTML = adminSectionsCache.map(section => `
        <article class="aicee-panel p-6">
            <div class="flex items-start justify-between gap-4">
                <div class="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-xl"><i class="fa-solid fa-users-rectangle"></i></div>
                <button type="button" onclick="openAdminSectionModal(${Number(section.id)})" class="w-10 h-10 rounded-xl hover:bg-gray-100 text-gray-500"><i class="fa-regular fa-pen-to-square"></i></button>
            </div>
            <h3 class="text-xl font-bold mt-5">${adminEscape(section.section_name)}</h3>
            <p class="text-sm text-gray-500 mt-2"><i class="fa-solid fa-chalkboard-user mr-2"></i>${adminEscape(section.teacher_name || "No teacher assigned")}</p>
            <div class="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between text-sm"><span class="text-gray-500">Students</span><strong>${Number(section.student_count) || 0}</strong></div>
        </article>`).join("");
}

function syncAdminAccountSectionField() {
    const role = document.getElementById("admin-account-role")?.value;
    const wrap = document.getElementById("admin-account-section-wrap");
    const section = document.getElementById("admin-account-section");
    const show = role === "student";
    if (wrap) wrap.classList.toggle("hidden", !show);
    if (section) section.required = show;
}

function openAdminAccountModal(accountId = null) {
    const modal = document.getElementById("admin-account-modal");
    const form = document.getElementById("admin-account-form");
    if (!modal || !form) return;

    form.reset();
    populateAdminSectionOptions();

    const account = accountId ? adminAccountsCache.find(item => Number(item.id) === Number(accountId)) : null;
    document.getElementById("admin-account-id").value = account ? account.id : "";
    document.getElementById("admin-account-modal-title").textContent = account ? "Edit Account" : "Create Account";
    document.getElementById("admin-account-name").value = account?.name || "";
    document.getElementById("admin-account-email").value = account?.email || "";
    document.getElementById("admin-account-role").value = account?.role || "student";
    document.getElementById("admin-account-role").disabled = Boolean(account);
    document.getElementById("admin-account-section").value = account?.section_id || "";
    document.getElementById("admin-account-password").required = !account;
    document.getElementById("admin-account-password-wrap").classList.toggle("hidden", Boolean(account));
    document.getElementById("admin-account-form-status").textContent = "";
    syncAdminAccountSectionField();
    modal.classList.remove("hidden");
}

function closeAdminAccountModal() {
    document.getElementById("admin-account-modal")?.classList.add("hidden");
}

async function submitAdminAccount(event) {
    event.preventDefault();

    const id = Number(document.getElementById("admin-account-id").value) || null;
    const roleEl = document.getElementById("admin-account-role");
    const body = {
        name: document.getElementById("admin-account-name").value.trim(),
        email: document.getElementById("admin-account-email").value.trim(),
        role: roleEl.value,
        section_id: roleEl.value === "student" ? Number(document.getElementById("admin-account-section").value) : null
    };
    if (!id) body.temporary_password = document.getElementById("admin-account-password").value;

    const status = document.getElementById("admin-account-form-status");
    const button = document.getElementById("admin-account-save");

    try {
        button.disabled = true;
        status.className = "text-sm min-h-[20px] text-blue-600";
        status.textContent = id ? "Saving changes..." : "Creating account...";

        const response = await fetch(id ? `/admin/accounts/${id}` : "/admin/accounts", {
            method: id ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Unable to save account.");

        status.className = "text-sm min-h-[20px] text-emerald-600";
        status.textContent = data.message || "Account saved.";
        await Promise.all([loadAdminAccounts(), loadAdminOverview()]);
        setTimeout(closeAdminAccountModal, 500);
    } catch (error) {
        status.className = "text-sm min-h-[20px] text-red-600";
        status.textContent = error.message;
    } finally {
        button.disabled = false;
    }
}

function openAdminResetModal(accountId) {
    const account = adminAccountsCache.find(item => Number(item.id) === Number(accountId));
    if (!account) return;
    document.getElementById("admin-reset-account-id").value = account.id;
    document.getElementById("admin-reset-account-label").textContent = `Set a temporary password for ${account.name}. Their existing sessions will be invalidated.`;
    document.getElementById("admin-reset-password").value = "";
    document.getElementById("admin-reset-status").textContent = "";
    document.getElementById("admin-reset-modal")?.classList.remove("hidden");
}

function closeAdminResetModal() {
    document.getElementById("admin-reset-modal")?.classList.add("hidden");
}

async function submitAdminPasswordReset(event) {
    event.preventDefault();
    const id = Number(document.getElementById("admin-reset-account-id").value);
    const newPassword = document.getElementById("admin-reset-password").value;
    const status = document.getElementById("admin-reset-status");

    try {
        status.className = "text-sm min-h-[20px] text-blue-600";
        status.textContent = "Resetting password...";
        const response = await fetch(`/admin/accounts/${id}/reset-password`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ new_password: newPassword })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Password reset failed.");
        status.className = "text-sm min-h-[20px] text-emerald-600";
        status.textContent = data.message || "Password reset.";
        setTimeout(closeAdminResetModal, 650);
    } catch (error) {
        status.className = "text-sm min-h-[20px] text-red-600";
        status.textContent = error.message;
    }
}

function openAdminSectionModal(sectionId = null) {
    const section = sectionId ? adminSectionsCache.find(item => Number(item.id) === Number(sectionId)) : null;
    populateAdminTeacherOptions();
    document.getElementById("admin-section-id").value = section?.id || "";
    document.getElementById("admin-section-modal-title").textContent = section ? "Edit Section" : "Create Section";
    document.getElementById("admin-section-name").value = section?.section_name || "";
    document.getElementById("admin-section-teacher").value = section?.teacher_id || "";
    document.getElementById("admin-section-status").textContent = "";
    document.getElementById("admin-section-modal")?.classList.remove("hidden");
}

function closeAdminSectionModal() {
    document.getElementById("admin-section-modal")?.classList.add("hidden");
}

async function submitAdminSection(event) {
    event.preventDefault();
    const id = Number(document.getElementById("admin-section-id").value) || null;
    const body = {
        section_name: document.getElementById("admin-section-name").value.trim(),
        teacher_id: Number(document.getElementById("admin-section-teacher").value)
    };
    const status = document.getElementById("admin-section-status");

    try {
        status.className = "text-sm min-h-[20px] text-blue-600";
        status.textContent = "Saving section...";
        const response = await fetch(id ? `/admin/sections/${id}` : "/admin/sections", {
            method: id ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Unable to save section.");
        status.className = "text-sm min-h-[20px] text-emerald-600";
        status.textContent = data.message || "Section saved.";
        await Promise.all([loadAdminSections(), loadAdminOverview()]);
        setTimeout(closeAdminSectionModal, 500);
    } catch (error) {
        status.className = "text-sm min-h-[20px] text-red-600";
        status.textContent = error.message;
    }
}


window.onload = async function () {

    initializeAiceeExperience();

    const diagnosticForm =
        document.getElementById(
            "diagnostic-form"
        );

    if (diagnosticForm) {

        diagnosticForm.addEventListener(
            "submit",
            submitDiagnosticQuiz
        );

    }

    const savedUser =
        localStorage.getItem("user");

    const savedToken =
        localStorage.getItem(AICEE_TOKEN_KEY);

    if (savedUser && savedToken) {

        try {

            currentUser =
                JSON.parse(savedUser);


            currentUser.role =
                String(
                    currentUser.role || "student"
                )
                    .trim()
                    .toLowerCase();

                    if (
    Number(
        currentUser.must_change_password
    ) === 1
) {

    document
        .getElementById("login-page")
        .classList.add("hidden");

    document
        .getElementById("main-app")
        .classList.add("hidden");

    openFirstLoginPasswordModal();

    return;
}

            localStorage.setItem(
                "user",
                JSON.stringify(currentUser)
            );

            document
                .getElementById("login-page")
                .classList.add("hidden");

            document
                .getElementById("main-app")
                .classList.remove("hidden");

            createSidebar(currentUser.role);

            switchRole(currentUser.role);

            populateProfile();

            await loadDashboard();


            initCharts();

            await checkDiagnosticQuiz();

        } catch (error) {

            console.error(
                "Saved user error:",
                error
            );

            localStorage.removeItem("user");

        }

    } else if (savedUser || savedToken) {
        clearAiceeSession();
    }

    console.log(
        "%cEduVision AI Prototype Ready 🚀",
        "color:#2563eb; font-size:13px; font-family:monospace"
    );

};
function populateStudentDashboardStats(stats) {

    const overallGrade =
        document.getElementById(
            "overall-grade"
        );

    const modulesCompleted =
        document.getElementById(
            "modules-completed"
        );

    const pendingTasks =
        document.getElementById(
            "pending-tasks"
        );

    const attendanceRate =
        document.getElementById(
            "attendance-rate"
        );

    const reportOverallGrade =
        document.getElementById(
            "report-overall-grade"
        );

    const reportModulesCompleted =
        document.getElementById(
            "report-modules-completed"
        );

    const reportStatus =
        document.getElementById(
            "report-status"
        );

    const grade =
        stats?.overall_grade;

    const completed =
        Number(
            stats?.completed_modules
        ) || 0;

    const total =
        Number(
            stats?.total_modules
        ) || 0;


    // Dashboard cards
    if (overallGrade) {

        overallGrade.textContent =
            grade !== null &&
            grade !== undefined
                ? grade
                : "—";

    }

    if (modulesCompleted) {

        modulesCompleted.textContent =
            `${completed} / ${total}`;

    }

    if (pendingTasks) {

        pendingTasks.textContent =
            stats?.pending_tasks !== null &&
            stats?.pending_tasks !== undefined
                ? stats.pending_tasks
                : "—";

    }

    if (attendanceRate) {

        attendanceRate.textContent =
            stats?.attendance !== null &&
            stats?.attendance !== undefined
                ? `${stats.attendance}%`
                : "—";

    }


    // Grades page summary
    if (reportOverallGrade) {

        reportOverallGrade.textContent =
            grade !== null &&
            grade !== undefined
                ? grade
                : "—";

    }

    if (reportModulesCompleted) {

        reportModulesCompleted.textContent =
            `${completed} / ${total}`;

    }

    if (reportStatus) {

        if (
            grade === null ||
            grade === undefined
        ) {

            reportStatus.textContent =
                "No Grades";

            reportStatus.className =
                "text-4xl font-bold text-gray-500 mt-1";

        } else if (Number(grade) >= 75) {

            reportStatus.textContent =
                "Passing";

            reportStatus.className =
                "text-4xl font-bold text-emerald-600 mt-1";

        } else {

            reportStatus.textContent =
                "Needs Support";

            reportStatus.className =
                "text-4xl font-bold text-amber-600 mt-1";

        }

    }

}



function getPrototypeLearningSignals() {
    const diagnostic=(Array.isArray(latestDiagnosticResults)?latestDiagnosticResults:[])
        .map(item=>({subject:String(item.subject||""),score:Number(item.percentage)||0,source:"diagnostic"}))
        .filter(item=>item.subject);
    const sorted=[...diagnostic].sort((a,b)=>b.score-a.score);
    return {strongest:sorted[0]||null,needsFocus:sorted[sorted.length-1]||null,usingDiagnostic:diagnostic.length>0};
}

function renderLearningBridgeDashboard() {
    if(currentRole!=="student") return;
    const firstName=String(currentUser.name||"Student").trim().split(/\s+/)[0]||"Student";
    const signals=getPrototypeLearningSignals();
    const hasDiagnostic=latestDiagnosticResults.length>0;
    const set=(id,value)=>{const el=document.getElementById(id); if(el) el.textContent=value;};
    set("learning-welcome-name",firstName);
    set("learning-strongest-area",signals.strongest?`${signals.strongest.subject} (${signals.strongest.score}%)`:"Take your diagnostic");
    set("learning-needs-focus",signals.needsFocus?`${signals.needsFocus.subject} (${signals.needsFocus.score}%)`:"Not enough data yet");
    set("learning-profile-status",hasDiagnostic?"Profile personalized":"Ready to personalize");
    set("learning-personalization-label",hasDiagnostic?"Active":"Getting started");
    set("learning-personalization-copy",hasDiagnostic?"AIcee uses your latest diagnostics, progress history, learning bio, and relevant study conversations.":"Complete your first diagnostic assessment to build your learning profile.");
    const insight=document.getElementById("learning-insight-text");
    if(insight){
        if(signals.strongest&&signals.needsFocus&&signals.strongest.subject!==signals.needsFocus.subject) insight.textContent=`${signals.strongest.subject} is currently one of your stronger areas, while ${signals.needsFocus.subject} may benefit from more focused review. Recurring diagnostics help AIcee measure how your profile changes over time.`;
        else if(signals.strongest) insight.textContent="Your latest diagnostic profile is ready. Continue studying with AIcee, then use the next diagnostic to measure your progress.";
        else insight.textContent="Complete your first diagnostic assessment so AIcee can identify your current strengths and areas that may need more support.";
    }
    const next=document.getElementById("diagnostic-next-date");
    if(next){
        if(diagnosticStatus.can_take) next.textContent="Available now";
        else if(diagnosticStatus.next_available_at) next.textContent=new Date(diagnosticStatus.next_available_at).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
        else next.textContent="Not scheduled";
    }
}

function buildAIceePrototypeContext() {
    return JSON.stringify({profile:{name:currentUser.name||"Student",section:currentUser.section_name||"Not specified",learningBio:currentUser.bio||""},diagnostics:latestDiagnosticResults});
}


async function loadDiagnosticProfileData(){
    if(currentRole!=="student"||!currentUser.id) return;
    try{
        const [sr,hr]=await Promise.all([
            fetch(`/diagnostic-status/${currentUser.id}`).catch(() => ({ ok: false })),
            fetch(`/diagnostic-history/${currentUser.id}`).catch(() => ({ ok: false }))
        ]);
        let s = { success: false }, h = { success: false };
        if (sr.ok && sr.headers?.get("content-type")?.includes("application/json")) {
            s = await sr.json();
        }
        if (hr.ok && hr.headers?.get("content-type")?.includes("application/json")) {
            h = await hr.json();
        }
        if(s.success) diagnosticStatus={has_completed:Boolean(s.has_completed),can_take:Boolean(s.can_take),last_taken_at:s.last_taken_at||null,next_available_at:s.next_available_at||null};
        if(h.success) diagnosticHistory=Array.isArray(h.attempts)?h.attempts:[];
        updateDiagnosticActionButton(); renderDiagnosticHistory(); renderLearningBridgeDashboard();
    }catch(e){console.error("Diagnostic profile load error:",e);}
}
function updateDiagnosticActionButton(){
    const b=document.getElementById("diagnostic-action"); if(!b) return; b.classList.remove("hidden");
    if(diagnosticStatus.can_take){b.disabled=false;b.innerHTML=`<i class="fa-solid fa-brain mr-2"></i>${diagnosticStatus.has_completed?"Take Weekly Diagnostic":"Take Diagnostic Assessment"}`;b.classList.remove("opacity-50","cursor-not-allowed");}
    else{b.disabled=true;b.innerHTML=`<i class="fa-solid fa-clock mr-2"></i>Next Diagnostic Soon`;b.classList.add("opacity-50","cursor-not-allowed");}
}
function renderDiagnosticHistory(){
    const c=document.getElementById("diagnostic-history"); if(!c) return;
    if(!diagnosticHistory.length){c.innerHTML=`<div class="text-sm text-gray-500 text-center py-5">Your recurring diagnostic history will appear here after your first assessment.</div>`;return;}
    c.innerHTML=diagnosticHistory.slice(0,6).map((a,i)=>{const scores=Array.isArray(a.results)?a.results:[];const avg=scores.length?Math.round(scores.reduce((s,x)=>s+Number(x.percentage||0),0)/scores.length):0;return `<div class="flex items-center justify-between gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100"><div><div class="text-sm font-semibold text-gray-800">${i===0?"Latest Diagnostic":`Previous Assessment ${i}`}</div><div class="text-xs text-gray-500 mt-1">${new Date(a.taken_at).toLocaleDateString()}</div></div><div class="text-right"><div class="text-xl font-bold text-blue-600">${avg}%</div><div class="text-xs text-gray-400">Overall</div></div></div>`;}).join("");
}

function populateDiagnosticResults(results) {

    const summary = document.getElementById(
        "diagnostic-summary"
    );

    const container = document.getElementById(
        "diagnostic-subjects"
    );

    const actionButton = document.getElementById(
        "diagnostic-action"
    );

    if (!summary || !container) return;

    const diagnosticResults =
        Array.isArray(results)
            ? results
            : [];

    latestDiagnosticResults = diagnosticResults.map(item => ({ ...item }));

    if (diagnosticResults.length === 0) {

        summary.innerHTML = `
            Complete the diagnostic quiz so AIcee can identify
            your strengths and subjects where you may need more support.
        `;

        container.innerHTML = "";

        if (actionButton) {
            actionButton.classList.remove("hidden");
        }

        renderLearningBridgeDashboard();
        return;

    }

    const sortedResults = [...diagnosticResults]
        .map(result => ({
            ...result,
            percentage:
                Number(result.percentage) || 0
        }))
        .sort(
            (a, b) =>
                b.percentage - a.percentage
        );

    const strongest = sortedResults[0];

    const needsSupport =
        sortedResults[sortedResults.length - 1];

    summary.innerHTML = `
        <p>
            Your strongest area is
            <span class="font-semibold text-emerald-600">
                ${strongest.subject}
            </span>
            with ${strongest.percentage}%.
        </p>

        ${
            sortedResults.length > 1
                ? `
                    <p class="mt-2">
                        You may need more support in
                        <span class="font-semibold text-amber-600">
                            ${needsSupport.subject}
                        </span>.
                    </p>
                `
                : ""
        }
    `;

    container.innerHTML = sortedResults
        .map(result => `

            <div>

                <div class="flex justify-between text-xs mb-2">

                    <span class="font-medium text-gray-700">
                        ${result.subject}
                    </span>

                    <span class="font-semibold">
                        ${result.percentage}%
                    </span>

                </div>

                <div class="h-2 bg-gray-100 rounded-full overflow-hidden">

                    <div
                        class="h-2 bg-blue-600 rounded-full"
                        style="width: ${result.percentage}%">
                    </div>

                </div>

            </div>

        `)
        .join("");

    updateDiagnosticActionButton();
    renderLearningBridgeDashboard();
}

async function loadDashboard() {

    try {

        const response = await fetch(
            `/dashboard/${currentUser.id}`
        );

        const data = await response.json();

        if (!response.ok || data.success === false) {
            throw new Error(
                data.message ||
                "Dashboard failed to load."
            );
        }


        sampleModules = (data.modules || []).map(
            module => ({

                id: module.id,
                title: module.title,
                description:
                    module.description || "",
                type: "PDF",
                progress:
                    Number(module.progress) || 0,
                icon: "📘",
                file: module.file,

                assignedSections:
                    module.assigned_sections || "",

                completedAt:
                    module.completed_at || null

            })
        );


        recentGrades = (data.grades || []).map(
            grade => [

                grade.title,

                "Grade",

                `${grade.grade}%`,

                "Latest"

            ]
        );


        fullGradesList = (data.grades || []).map(
    grade => {

        const score =
            Number(grade.grade) || 0;

        return {
            subject:
                grade.title,

            code:
                "—",

            score:
                `${score}%`,

            grade:
                getLetterGrade(score),

            status:
                score >= 75
                    ? "Passed"
                    : "Needs Improvement",

            instructor:
                grade.teacher_name ||
                "No assigned teacher"
        };

    }
);

        populateStudentDashboardStats(
            data.stats || {}
        );

        populateDiagnosticResults(
            data.diagnostic_results || []
        );

        populateModules();
        populateRecentGrades();
        populateFullGrades();

        if (currentRole === "student") {
            // Modules, assignments, deadlines, and raw grades are intentionally
            // not loaded as student-facing LMS widgets in the leader-aligned prototype.
            // The existing backend features remain untouched for compatibility.
            renderLearningBridgeDashboard();
        }

        console.log(
            "Dashboard data:",
            data
        );

    } catch (error) {

        console.error(
            "Dashboard error:",
            error
        );

    }

}


/* =========================================
   OFFICIAL GRADEBOOK
========================================= */

let officialGradebookStudents = [];
let officialGradebookDataTable = null;

function setGradebookMessage(message, type = "info") {

    const element =
        document.getElementById(
            "gradebook-message"
        );

    if (!element) return;

    const styles = {
        info: "bg-blue-50 text-blue-700",
        success: "bg-emerald-50 text-emerald-700",
        error: "bg-red-50 text-red-700",
        warning: "bg-amber-50 text-amber-700"
    };

    element.className =
        `flex-1 rounded-2xl px-4 py-3 text-sm ${
            styles[type] || styles.info
        }`;

    element.textContent = message;
    element.classList.remove("hidden");
}

function destroyOfficialGradebookDataTable() {

    if (officialGradebookDataTable) {
        officialGradebookDataTable.destroy();
        officialGradebookDataTable = null;
    }
}

function initializeOfficialGradebookDataTable() {

    const table =
        document.getElementById(
            "official-gradebook-table"
        );

    if (
        !table ||
        typeof DataTable === "undefined"
    ) {
        return;
    }

    destroyOfficialGradebookDataTable();

    officialGradebookDataTable =
        new DataTable(
            table,
            {
                pageLength: 10,

                lengthMenu: [
                    5,
                    10,
                    25,
                    50
                ],

                order: [
                    [0, "asc"]
                ],

                columnDefs: [
                    {
                        targets: 3,
                        orderable: false,
                        searchable: false
                    }
                ],

                language: {
                    lengthMenu:
                        "Show _MENU_ students",

                    info:
                        "Showing _START_ to _END_ of _TOTAL_ students",

                    infoEmpty:
                        "No students available",

                    emptyTable:
                        "No students found",

                    zeroRecords:
                        "No matching students found"
                }
            }
        );
}

async function loadGradebookSections() {

    const select =
        document.getElementById(
            "gradebook-section"
        );

    if (!select) return;

    const previousValue = select.value;

    select.innerHTML = `
        <option value="">
            Loading sections...
        </option>
    `;

    select.disabled = true;

    try {

        const response = await fetch(
            `/sections?teacher_id=${currentUser.id}`
        );

        const sections =
            await response.json();

        if (
            !response.ok ||
            !Array.isArray(sections)
        ) {
            throw new Error(
                sections.message ||
                "Failed to load sections."
            );
        }

        select.innerHTML = `
            <option value="">
                Select section
            </option>
        `;

        sections.forEach(section => {

            const option =
                document.createElement(
                    "option"
                );

            option.value = section.id;
            option.textContent =
                section.section_name;

            select.appendChild(option);
        });

        if (
            previousValue &&
            sections.some(
                section =>
                    String(section.id) ===
                    String(previousValue)
            )
        ) {
            select.value = previousValue;
        }

        if (sections.length === 0) {
            setGradebookMessage(
                "No sections are assigned to this teacher.",
                "warning"
            );
        }

    } catch (error) {

        console.error(
            "Load gradebook sections error:",
            error
        );

        select.innerHTML = `
            <option value="">
                Failed to load sections
            </option>
        `;

        setGradebookMessage(
            error.message ||
            "Failed to load sections.",
            "error"
        );

    } finally {

        select.disabled = false;
    }
}

function getOfficialGradebookFilters() {

    return {
        section_id:
            document.getElementById(
                "gradebook-section"
            )?.value || "",

        subject_name:
            document.getElementById(
                "gradebook-subject"
            )?.value.trim() || "",

        grading_period:
            document.getElementById(
                "gradebook-period"
            )?.value || "",

        school_year:
            document.getElementById(
                "gradebook-school-year"
            )?.value.trim() ||
            "2026-2027",

        semester:
            document.getElementById(
                "gradebook-semester"
            )?.value ||
            "1st Semester"
    };
}

async function loadOfficialGradebook() {

    if (currentRole !== "teacher") {
        return;
    }

    const filters =
        getOfficialGradebookFilters();

    if (
        !filters.section_id ||
        !filters.subject_name ||
        !filters.grading_period
    ) {
        setGradebookMessage(
            "Select a section, enter the subject, and choose a grading period.",
            "warning"
        );

        return;
    }

    const tbody =
        document.getElementById(
            "official-gradebook-tbody"
        );

    const saveButton =
        document.getElementById(
            "gradebook-save-button"
        );

    destroyOfficialGradebookDataTable();

    if (saveButton) {
        saveButton.classList.add("hidden");
        saveButton.classList.remove("flex");
    }

    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td
                    colspan="4"
                    class="px-6 py-12 text-center text-gray-500"
                >
                    Loading students...
                </td>
            </tr>
        `;
    }

    setGradebookMessage(
        "Loading official gradebook...",
        "info"
    );

    try {

        const params =
            new URLSearchParams({
                section_id:
                    filters.section_id,

                subject_name:
                    filters.subject_name,

                grading_period:
                    filters.grading_period,

                school_year:
                    filters.school_year,

                semester:
                    filters.semester
            });

        const response = await fetch(
            `/teacher/${currentUser.id}/official-gradebook?${params.toString()}`
        );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {
            throw new Error(
                data.message ||
                "Failed to load gradebook."
            );
        }

        officialGradebookStudents =
            (data.students || []).map(
                student => ({
                    ...student,

                    grade:
                        student.grade === null ||
                        student.grade === undefined
                            ? ""
                            : String(student.grade)
                })
            );

        renderOfficialGradebookStudents();

        if (officialGradebookStudents.length > 0) {

            if (saveButton) {
                saveButton.classList.remove(
                    "hidden"
                );

                saveButton.classList.add(
                    "flex"
                );
            }

            setGradebookMessage(
                `${officialGradebookStudents.length} student(s) loaded. Enter grades from 0 to 100.`,
                "success"
            );

        } else {

            setGradebookMessage(
                "No student accounts were found in the selected section.",
                "warning"
            );
        }

    } catch (error) {

        console.error(
            "Load official gradebook error:",
            error
        );

        officialGradebookStudents = [];

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td
                        colspan="4"
                        class="px-6 py-12 text-center text-red-600"
                    >
                        ${escapeHTML(
                            error.message ||
                            "Failed to load gradebook."
                        )}
                    </td>
                </tr>
            `;
        }

        setGradebookMessage(
            error.message ||
            "Failed to load gradebook.",
            "error"
        );
    }
}

function renderOfficialGradebookStudents() {

    const tbody =
        document.getElementById(
            "official-gradebook-tbody"
        );

    if (!tbody) return;

    destroyOfficialGradebookDataTable();
    tbody.innerHTML = "";

    if (
        !Array.isArray(
            officialGradebookStudents
        ) ||
        officialGradebookStudents.length === 0
    ) {
        tbody.innerHTML = `
            <tr>
                <td
                    colspan="4"
                    class="px-6 py-12 text-center text-gray-500"
                >
                    No students found.
                </td>
            </tr>
        `;

        return;
    }

    officialGradebookStudents.forEach(
        student => {

            const row =
                document.createElement(
                    "tr"
                );

            row.className =
                "hover:bg-gray-50 transition-colors";

            const numericGrade =
                Number(student.grade);

            const gradeValue =
                student.grade !== "" &&
                Number.isFinite(numericGrade)
                    ? numericGrade
                    : "";

            row.innerHTML = `
                <td class="px-6 py-4">
                    <div class="font-semibold text-gray-900">
                        ${escapeHTML(
                            student.student_name
                        )}
                    </div>

                    <div class="text-xs text-gray-400 mt-1">
                        ID ${student.student_id}
                    </div>
                </td>

                <td class="px-6 py-4 text-sm text-gray-600">
                    ${escapeHTML(
                        student.email ||
                        "No email"
                    )}
                </td>

                <td class="px-6 py-4 text-sm text-gray-600">
                    ${escapeHTML(
                        student.section_name ||
                        "No section"
                    )}
                </td>

                <td class="px-6 py-4">
                    <div class="flex justify-center">
                        <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value="${gradeValue}"
                            oninput="updateOfficialGradeValue(${student.student_id}, this.value)"
                            class="w-28 px-4 py-2.5 text-center bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500"
                            placeholder="—"
                        >
                    </div>
                </td>
            `;

            tbody.appendChild(row);
        }
    );

    initializeOfficialGradebookDataTable();
}

function updateOfficialGradeValue(
    studentId,
    value
) {

    const student =
        officialGradebookStudents.find(
            item =>
                Number(item.student_id) ===
                Number(studentId)
        );

    if (!student) return;

    student.grade = value;
}

async function saveOfficialGrades() {

    if (currentRole !== "teacher") {
        return;
    }

    const filters =
        getOfficialGradebookFilters();

    const saveButton =
        document.getElementById(
            "gradebook-save-button"
        );

    const grades =
        officialGradebookStudents
            .filter(
                student =>
                    String(
                        student.grade
                    ).trim() !== ""
            )
            .map(
                student => ({
                    student_id:
                        Number(
                            student.student_id
                        ),

                    grade:
                        Number(
                            student.grade
                        )
                })
            );

    if (grades.length === 0) {
        setGradebookMessage(
            "Enter at least one official grade before saving.",
            "warning"
        );

        return;
    }

    const invalidGrade =
        grades.find(
            item =>
                !Number.isFinite(
                    item.grade
                ) ||
                item.grade < 0 ||
                item.grade > 100
        );

    if (invalidGrade) {
        setGradebookMessage(
            "Every grade must be a number from 0 to 100.",
            "error"
        );

        return;
    }

    if (saveButton) {
        saveButton.disabled = true;
        saveButton.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            Saving...
        `;
    }

    setGradebookMessage(
        "Saving official grades...",
        "info"
    );

    try {

        const response = await fetch(
            "/official-grades/bulk",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    teacher_id:
                        currentUser.id,

                    section_id:
                        Number(
                            filters.section_id
                        ),

                    subject_name:
                        filters.subject_name,

                    grading_period:
                        filters.grading_period,

                    school_year:
                        filters.school_year,

                    semester:
                        filters.semester,

                    grades
                })
            }
        );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {
            throw new Error(
                data.message ||
                "Failed to save official grades."
            );
        }

        setGradebookMessage(
            data.message ||
            "Official grades saved successfully.",
            "success"
        );

        await loadOfficialGradebook();

    } catch (error) {

        console.error(
            "Save official grades error:",
            error
        );

        setGradebookMessage(
            error.message ||
            "Failed to save official grades.",
            "error"
        );

    } finally {

        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerHTML = `
                <i class="fa-solid fa-floppy-disk"></i>
                Save All Grades
            `;
        }
    }
}

/* =========================================
   DYNAMIC STUDENT GRADE PROGRESS
========================================= */

function normalizeGradingPeriod(period) {

    const value = String(period || "")
        .trim()
        .toLowerCase();

    if (
        value.includes("1st") ||
        value.includes("first")
    ) {
        return "1st Quarter";
    }

    if (
        value.includes("2nd") ||
        value.includes("second")
    ) {
        return "2nd Quarter";
    }

    if (
        value.includes("3rd") ||
        value.includes("third")
    ) {
        return "3rd Quarter";
    }

    if (
        value.includes("4th") ||
        value.includes("fourth")
    ) {
        return "4th Quarter";
    }

    if (value.includes("final")) {
        return "Final Grade";
    }

    return String(period || "").trim();
}


function getSchoolYearStart(schoolYear) {

    const match = String(schoolYear || "")
        .match(/\d{4}/);

    return match
        ? Number(match[0])
        : 0;
}


function renderStudentGradeProgress(officialGrades) {

    const canvas =
        document.getElementById(
            "progressChart"
        );

    if (
        !canvas ||
        typeof Chart === "undefined"
    ) {
        return;
    }

    const parent = canvas.parentElement;

    let contextLabel =
        document.getElementById(
            "grade-progress-context"
        );

    if (!contextLabel && parent) {

        contextLabel =
            document.createElement("div");

        contextLabel.id =
            "grade-progress-context";

        contextLabel.className =
            "text-xs text-gray-500 -mt-4 mb-5";

        parent.insertBefore(
            contextLabel,
            canvas
        );
    }

    let emptyMessage =
        document.getElementById(
            "grade-progress-empty"
        );

    if (!emptyMessage && parent) {

        emptyMessage =
            document.createElement("div");

        emptyMessage.id =
            "grade-progress-empty";

        emptyMessage.className =
            "hidden py-10 text-center text-sm text-gray-500";

        canvas.insertAdjacentElement(
            "afterend",
            emptyMessage
        );
    }

    const existingChart =
        Chart.getChart(canvas);

    if (existingChart) {
        existingChart.destroy();
    }

    const validGrades =
        Array.isArray(officialGrades)
            ? officialGrades.filter(item =>
                Number.isFinite(
                    Number(item.grade)
                )
            )
            : [];

    if (validGrades.length === 0) {

        canvas.classList.add("hidden");

        if (contextLabel) {
            contextLabel.textContent =
                "Official grade averages by grading period";
        }

        if (emptyMessage) {
            emptyMessage.classList.remove(
                "hidden"
            );

            emptyMessage.innerHTML = `
                <div class="text-4xl mb-3">
                    📈
                </div>

                <p class="font-medium text-gray-700">
                    No grade progress yet
                </p>

                <p class="text-xs text-gray-500 mt-1">
                    Your chart will appear after official grades are recorded.
                </p>
            `;
        }

        return;
    }

    const schoolYears = [
        ...new Set(
            validGrades
                .map(item =>
                    String(
                        item.school_year || ""
                    ).trim()
                )
                .filter(Boolean)
        )
    ];

    const latestSchoolYear =
        schoolYears.sort(
            (a, b) =>
                getSchoolYearStart(b) -
                getSchoolYearStart(a)
        )[0] || "";

    const currentGrades =
        latestSchoolYear
            ? validGrades.filter(item =>
                String(
                    item.school_year || ""
                ).trim() === latestSchoolYear
            )
            : validGrades;

    const gradingPeriods = [
        "1st Quarter",
        "2nd Quarter",
        "3rd Quarter",
        "4th Quarter",
        "Final Grade"
    ];

    const averages =
        gradingPeriods.map(period => {

            const periodGrades =
                currentGrades
                    .filter(item =>
                        normalizeGradingPeriod(
                            item.grading_period
                        ) === period
                    )
                    .map(item =>
                        Number(item.grade)
                    )
                    .filter(grade =>
                        Number.isFinite(grade)
                    );

            if (periodGrades.length === 0) {
                return null;
            }

            const total =
                periodGrades.reduce(
                    (sum, grade) =>
                        sum + grade,
                    0
                );

            return Number(
                (
                    total /
                    periodGrades.length
                ).toFixed(2)
            );
        });

    const hasPeriodData =
        averages.some(
            average => average !== null
        );

    if (!hasPeriodData) {

        canvas.classList.add("hidden");

        if (emptyMessage) {
            emptyMessage.classList.remove(
                "hidden"
            );

            emptyMessage.innerHTML = `
                <div class="text-4xl mb-3">
                    📈
                </div>

                <p class="font-medium text-gray-700">
                    No quarter data available
                </p>

                <p class="text-xs text-gray-500 mt-1">
                    Add a grading period to the official grade records.
                </p>
            `;
        }

        return;
    }

    canvas.classList.remove("hidden");

    if (emptyMessage) {
        emptyMessage.classList.add("hidden");
    }

    if (contextLabel) {
        contextLabel.textContent =
            latestSchoolYear
                ? `School Year ${latestSchoolYear} • Average of all official subjects`
                : "Average of all official subjects";
    }

    createOrReplaceChart(
        canvas,
        {
            type: "line",

            data: {
                labels: gradingPeriods,

                datasets: [
                    {
                        label:
                            "Official Grade Average",

                        data: averages,

                        borderColor:
                            "#2563eb",

                        backgroundColor:
                            "rgba(37, 99, 235, 0.12)",

                        tension: 0.35,
                        borderWidth: 3,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        spanGaps: false,
                        fill: true
                    }
                ]
            },

            options: {
                responsive: true,
                maintainAspectRatio: true,

                plugins: {
                    legend: {
                        display: false
                    },

                    tooltip: {
                        callbacks: {
                            label: context =>
                                context.parsed.y === null
                                    ? "No grade yet"
                                    : `${context.parsed.y}% average`
                        }
                    }
                },

                scales: {
                    y: {
                        beginAtZero: true,
                        min: 0,
                        max: 100,

                        ticks: {
                            callback: value =>
                                `${value}%`
                        },

                        grid: {
                            color: "#f3f4f6"
                        }
                    }
                }
            }
        }
    );
}


/* =========================================
   STUDENT OFFICIAL GRADES
========================================= */

async function loadStudentOfficialGrades() {

    if (
        currentRole !== "student" ||
        !currentUser.id
    ) {
        return;
    }

    try {

        const response = await fetch(
            `/student/${currentUser.id}/official-grades`
        );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {
            throw new Error(
                data.message ||
                "Failed to load official grades."
            );
        }

        const officialGrades =
            data.grades || [];

        renderStudentGradeProgress(
            officialGrades
        );

        fullGradesList =
            officialGrades.map(
                item => {

                    const score =
                        Number(item.grade) || 0;

                    const formattedScore =
                        Number.isInteger(score)
                            ? String(score)
                            : score.toFixed(2);

                    return {
                        subject:
                            item.subject_name,

                        code:
                            `${item.grading_period} • ${item.semester}`,

                        score:
                            `${formattedScore}%`,

                        grade:
                            getLetterGrade(
                                score
                            ),

                        status:
                            score >= 75
                                ? "Passed"
                                : "Needs Improvement",

                        instructor:
                            item.teacher_name ||
                            "Teacher not assigned"
                    };
                }
            );

        recentGrades =
            officialGrades
                .slice(0, 4)
                .map(item => {

                    const score =
                        Number(item.grade) || 0;

                    const updatedDate =
                        item.updated_at
                            ? new Date(
                                item.updated_at
                            ).toLocaleDateString(
                                "en-PH",
                                {
                                    month: "short",
                                    day: "numeric"
                                }
                            )
                            : "Latest";

                    return [
                        item.subject_name,
                        item.grading_period,
                        `${score}%`,
                        updatedDate
                    ];
                });

        const numericGrades =
            officialGrades
                .map(
                    item =>
                        Number(item.grade)
                )
                .filter(
                    grade =>
                        Number.isFinite(
                            grade
                        )
                );

        const average =
            numericGrades.length > 0
                ? numericGrades.reduce(
                    (sum, grade) =>
                        sum + grade,
                    0
                ) / numericGrades.length
                : null;

        const formattedAverage =
            average === null
                ? "—"
                : `${
                    Number.isInteger(average)
                        ? average
                        : average.toFixed(2)
                }%`;

        const overallElements = [
            document.getElementById(
                "overall-grade"
            ),

            document.getElementById(
                "report-overall-grade"
            )
        ];

        overallElements.forEach(
            element => {

                if (element) {
                    element.textContent =
                        formattedAverage;
                }
            }
        );

        const reportStatus =
            document.getElementById(
                "report-status"
            );

        if (reportStatus) {

            if (average === null) {
                reportStatus.textContent =
                    "No Grades";

                reportStatus.className =
                    "text-4xl font-bold text-gray-800 mt-1";

            } else if (average >= 75) {
                reportStatus.textContent =
                    "Passing";

                reportStatus.className =
                    "text-4xl font-bold text-emerald-600 mt-1";

            } else {
                reportStatus.textContent =
                    "Needs Improvement";

                reportStatus.className =
                    "text-4xl font-bold text-red-600 mt-1";
            }
        }

        populateFullGrades();
        populateRecentGrades();

    } catch (error) {

        console.error(
            "Load student official grades error:",
            error
        );

        fullGradesList = [];
        recentGrades = [];

        renderStudentGradeProgress([]);

        populateFullGrades();
        populateRecentGrades();
    }
}


/* =========================================
   MANAGE STUDENTS
========================================= */

let managedStudents = [];

let managedStudentsDataTable = null;

function destroyManagedStudentsDataTable() {

    if (managedStudentsDataTable) {

        managedStudentsDataTable.destroy();

        managedStudentsDataTable = null;

    }

}


function initializeManagedStudentsDataTable() {

    const table =
        document.getElementById(
            "managed-students-table"
        );

    if (!table) {

        console.error(
            "managed-students-table not found."
        );

        return;
    }

    if (typeof DataTable === "undefined") {

        console.error(
            "DataTables library did not load."
        );

        return;
    }

    destroyManagedStudentsDataTable();

    managedStudentsDataTable =
        new DataTable(
            table,
            {
                pageLength: 10,

                lengthMenu: [
                    5,
                    10,
                    25,
                    50
                ],

                order: [
                    [0, "asc"]
                ],

                /*
                    Custom search box na ang
                    ginagamit natin sa HTML.
                */

                layout: {
                    topStart:
                        "pageLength",

                    topEnd:
                        null,

                    bottomStart:
                        "info",

                    bottomEnd:
                        "paging"
                },

                /*
                    Huwag i-sort at i-search
                    ang Actions column.
                */

                columnDefs: [
                    {
                        targets: 4,
                        orderable: false,
                        searchable: false
                    }
                ],

                language: {

                    lengthMenu:
                        "Show _MENU_ students",

                    info:
                        "Showing _START_ to _END_ of _TOTAL_ students",

                    infoEmpty:
                        "No students available",

                    emptyTable:
                        "No students found",

                    zeroRecords:
                        "No matching students found"
                }
            }
        );

}

async function loadManagedStudents() {

    const tbody =
        document.getElementById(
            "managed-students-tbody"
        );

    if (!tbody) return;

destroyManagedStudentsDataTable();

tbody.innerHTML = `
        <tr>
            <td
                colspan="5"
                class="px-6 py-12 text-center text-gray-500"
            >
                Loading student accounts...
            </td>
        </tr>
    `;

    try {

        const response = await fetch(
            `/teacher-students/${currentUser.id}`
        );

        const data = await response.json();

        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Failed to load students."
            );

        }

        managedStudents =
            data.students || [];

        updateManagedStudentSummary();
        populateStudentSectionFilter();
        renderManagedStudents(
            managedStudents
        );

    } catch (error) {

        console.error(
            "Load managed students error:",
            error
        );

        tbody.innerHTML = `
            <tr>
                <td
                    colspan="5"
                    class="px-6 py-12 text-center text-red-600"
                >
                    Failed to load student accounts.
                </td>
            </tr>
        `;

    }

}


function renderManagedStudents(students) {

    const tbody =
        document.getElementById(
            "managed-students-tbody"
        );

    if (!tbody) return;

    tbody.innerHTML = "";

    if (
        !Array.isArray(students) ||
        students.length === 0
    ) {

        tbody.innerHTML = `
            <tr>
                <td
                    colspan="5"
                    class="px-6 py-12 text-center text-gray-500"
                >
                    No students found.
                </td>
            </tr>
        `;

        return;

    }

    students.forEach(student => {

        const row =
            document.createElement("tr");

        row.className =
            "hover:bg-gray-50 transition-colors";

        const diagnosticCompleted =
            Number(
                student.diagnostic_completed
            ) === 1;

        const diagnosticBadge =
            diagnosticCompleted
                ? `
                    <span class="inline-flex px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
                        Completed
                    </span>
                `
                : `
                    <span class="inline-flex px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                        Pending
                    </span>
                `;

        row.innerHTML = `
            <td class="px-6 py-4">

                <div class="flex items-center gap-3">

                    <div class="w-10 h-10 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center font-semibold">
                        ${getStudentInitials(
                            student.name
                        )}
                    </div>

                    <div>

                        <div class="font-semibold text-gray-900">
                            ${escapeHTML(
                                student.name
                            )}
                        </div>

                        <div class="text-xs text-gray-400">
                            Student ID: ${student.id}
                        </div>

                    </div>

                </div>

            </td>

            <td class="px-6 py-4 text-sm text-gray-600">
                ${escapeHTML(
                    student.email
                )}
            </td>

            <td class="px-6 py-4">

                <span class="inline-flex px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                    ${escapeHTML(
                        student.section_name ||
                        "No Section"
                    )}
                </span>

            </td>

            <td class="px-6 py-4 text-center">
                ${diagnosticBadge}
            </td>

            <td class="px-6 py-4 text-center">

                <button
                    type="button"
                    onclick="openTeacherStudentInsight(${student.id})"
                    class="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-semibold"
                >
                    <i class="fa-solid fa-brain mr-1"></i>
                    View AI Profile
                </button>

            </td>
        `;

        tbody.appendChild(row);

        

    });
    initializeManagedStudentsDataTable();

filterManagedStudents();

}


function updateManagedStudentSummary() {

    const totalElement =
        document.getElementById(
            "managed-student-count"
        );

    const completedElement =
        document.getElementById(
            "diagnostic-completed-count"
        );

    const pendingElement =
        document.getElementById(
            "diagnostic-pending-count"
        );

    const completedCount =
        managedStudents.filter(
            student =>
                Number(
                    student.diagnostic_completed
                ) === 1
        ).length;

    const pendingCount =
        managedStudents.length -
        completedCount;

    if (totalElement) {
        totalElement.textContent =
            managedStudents.length;
    }

    if (completedElement) {
        completedElement.textContent =
            completedCount;
    }

    if (pendingElement) {
        pendingElement.textContent =
            pendingCount;
    }

}


function populateStudentSectionFilter() {

    const filter =
        document.getElementById(
            "student-section-filter"
        );

    if (!filter) return;

    const selectedValue =
        filter.value;

    const sections = [
        ...new Set(
            managedStudents
                .map(student =>
                    student.section_name
                )
                .filter(Boolean)
        )
    ].sort();

    filter.innerHTML = `
        <option value="">
            All Sections
        </option>

        ${sections
            .map(section => `
                <option value="${escapeHTML(section)}">
                    ${escapeHTML(section)}
                </option>
            `)
            .join("")}
    `;

    if (
        sections.includes(
            selectedValue
        )
    ) {
        filter.value =
            selectedValue;
    }

}


function filterManagedStudents() {

    if (!managedStudentsDataTable) {
        return;
    }

    const searchInput =
        document.getElementById(
            "student-search"
        );

    const sectionFilter =
        document.getElementById(
            "student-section-filter"
        );

    const searchValue =
        String(
            searchInput?.value || ""
        ).trim();

    const sectionValue =
        String(
            sectionFilter?.value || ""
        ).trim();

    /*
        Search sa buong table:
        student name, email, section, etc.
    */

    managedStudentsDataTable
        .search(searchValue);

    /*
        Column index 2 = Section column.
    */

    managedStudentsDataTable
        .column(2)
        .search(sectionValue);

    managedStudentsDataTable.draw();

}

async function showAddStudentModal() {

    const modal =
        document.getElementById(
            "add-student-modal"
        );

    const sectionSelect =
        document.getElementById(
            "new-student-section"
        );

    const message =
        document.getElementById(
            "add-student-message"
        );

    if (!modal || !sectionSelect) {
        return;
    }

    if (message) {
        message.textContent = "";
    }

    sectionSelect.innerHTML = `
        <option value="">
            Loading sections...
        </option>
    `;

    modal.classList.remove("hidden");

    try {

        const response = await fetch(
            `/sections?teacher_id=${currentUser.id}`
        );

        const sections =
            await response.json();

        if (
            !response.ok ||
            !Array.isArray(sections)
        ) {

            throw new Error(
                "Failed to load sections."
            );

        }

        sectionSelect.innerHTML = `
            <option value="">
                Select a section
            </option>

            ${sections
                .map(section => `
                    <option value="${section.id}">
                        ${escapeHTML(
                            section.section_name
                        )}
                    </option>
                `)
                .join("")}
        `;

    } catch (error) {

        console.error(
            "Load sections error:",
            error
        );

        sectionSelect.innerHTML = `
            <option value="">
                Failed to load sections
            </option>
        `;

    }

}


function closeAddStudentModal() {

    const modal =
        document.getElementById(
            "add-student-modal"
        );

    const form =
        document.getElementById(
            "add-student-form"
        );

    const message =
        document.getElementById(
            "add-student-message"
        );

    if (modal) {
        modal.classList.add("hidden");
    }

    if (form) {
        form.reset();
    }

    if (message) {
        message.textContent = "";
    }

}


function generateTemporaryPassword() {

    const passwordInput =
        document.getElementById(
            "new-student-password"
        );

    if (!passwordInput) return;

    const randomNumber =
        Math.floor(
            1000 +
            Math.random() * 9000
        );

    passwordInput.value =
        `AIcee${randomNumber}`;

}


async function createStudentAccount(event) {

    event.preventDefault();

    const nameInput =
        document.getElementById(
            "new-student-name"
        );

    const emailInput =
        document.getElementById(
            "new-student-email"
        );

    const sectionInput =
        document.getElementById(
            "new-student-section"
        );

    const passwordInput =
        document.getElementById(
            "new-student-password"
        );

    const message =
        document.getElementById(
            "add-student-message"
        );

    if (message) {
        message.className =
            "text-sm text-center min-h-[20px] text-blue-600";

        message.textContent =
            "Creating account...";
    }

    try {

        const response = await fetch(
            "/teacher-students",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    teacher_id:
                        currentUser.id,

                    name:
                        nameInput.value.trim(),

                    email:
                        emailInput.value.trim(),

                    temporary_password:
                        passwordInput.value.trim(),

                    section_id:
                        Number(
                            sectionInput.value
                        )
                })
            }
        );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Account creation failed."
            );

        }

        showLegacyAlert(
            `✅ Account created!\n\n` +
            `Student: ${data.student.name}\n` +
            `Email: ${data.student.email}\n` +
            `Temporary password: ${passwordInput.value}`
        );

        closeAddStudentModal();

        await loadManagedStudents();

    } catch (error) {

        console.error(
            "Create student error:",
            error
        );

        if (message) {

            message.className =
                "text-sm text-center min-h-[20px] text-red-600";

            message.textContent =
                error.message;

        }

    }

}


async function resetStudentPassword(
    studentId,
    studentName
) {

    const newPassword =
        await showPromptPopup({
            title: "Reset Student Password",
            message:
                `Enter a temporary password for ${studentName}. The student will be required to change it after signing in.`,
            defaultValue: "AIcee1234",
            inputType: "password",
            confirmText: "Continue",
            required: true,
            minLength: 4
        });

    if (newPassword === null) {
        return;
    }

    const confirmed =
        await showConfirmPopup({
            title: "Confirm Password Reset",
            message:
                `Reset ${studentName}'s password to the temporary password you entered?`,
            confirmText: "Reset Password",
            cancelText: "Cancel",
            type: "danger"
        });

    if (!confirmed) return;

    try {

        const response = await fetch(
            `/teacher-students/${studentId}/reset-password`,
            {
                method: "PUT",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    teacher_id:
                        currentUser.id,

                    new_password:
                        newPassword.trim()
                })
            }
        );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Password reset failed."
            );

        }

        showMessagePopup(
            "Password Reset Successful",
            `Student: ${studentName}
Temporary password: ${newPassword.trim()}`,
            "success"
        );

    } catch (error) {

        console.error(
            "Reset password error:",
            error
        );

        showMessagePopup(
            "Password Reset Failed",
            error.message,
            "error"
        );

    }

}


function getStudentInitials(name) {

    return String(name || "S")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(word =>
            word.charAt(0).toUpperCase()
        )
        .join("");

}


function escapeJavaScriptString(value) {

    return String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/\r/g, "")
        .replace(/\n/g, " ");

}

/* =========================================
   FIRST LOGIN PASSWORD CHANGE
========================================= */

function openFirstLoginPasswordModal() {

    const modal =
        document.getElementById(
            "change-password-modal"
        );

    const form =
        document.getElementById(
            "change-password-form"
        );

    const message =
        document.getElementById(
            "change-password-message"
        );

    if (form) {
        form.reset();
    }

    if (message) {
        message.textContent = "";
    }

    if (modal) {
        modal.classList.remove("hidden");
    }

}


async function submitFirstLoginPassword(event) {

    event.preventDefault();

    const currentPassword =
        document.getElementById(
            "current-password"
        ).value;

    const newPassword =
        document.getElementById(
            "new-password"
        ).value;

    const confirmPassword =
        document.getElementById(
            "confirm-new-password"
        ).value;

    const message =
        document.getElementById(
            "change-password-message"
        );

    const submitButton =
        document.getElementById(
            "change-password-submit"
        );

    if (newPassword !== confirmPassword) {

        message.className =
            "text-sm text-center min-h-[20px] text-red-600";

        message.textContent =
            "New passwords do not match.";

        return;
    }

    if (newPassword.length < 6) {

        message.className =
            "text-sm text-center min-h-[20px] text-red-600";

        message.textContent =
            "Password must contain at least 6 characters.";

        return;
    }

    try {

        submitButton.disabled = true;
        submitButton.textContent =
            "Changing password...";

        message.className =
            "text-sm text-center min-h-[20px] text-blue-600";

        message.textContent =
            "Please wait...";

        const response = await fetch(
            "/change-password",
            {
                method: "PUT",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    user_id:
                        currentUser.id,

                    current_password:
                        currentPassword,

                    new_password:
                        newPassword
                })
            }
        );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Password change failed."
            );
        }

        if (data.token) {
            localStorage.setItem(
                AICEE_TOKEN_KEY,
                data.token
            );
        }

        currentUser.must_change_password = 0;

        localStorage.setItem(
            "user",
            JSON.stringify(currentUser)
        );

        document
            .getElementById(
                "change-password-modal"
            )
            .classList.add("hidden");

        document
            .getElementById("main-app")
            .classList.remove("hidden");

        createSidebar(currentUser.role);
        switchRole(currentUser.role);
        populateProfile();

        await loadDashboard();

        initCharts();

        await checkDiagnosticQuiz();

        showLegacyAlert(
            "✅ Password changed successfully! Welcome to AIcee."
        );

    } catch (error) {

        console.error(
            "First login password error:",
            error
        );

        message.className =
            "text-sm text-center min-h-[20px] text-red-600";

        message.textContent =
            error.message;

    } finally {

        submitButton.disabled = false;
        submitButton.textContent =
            "Change Password";

    }

}

function showForgotPasswordModal() {

    speakAicee("No worries — enter your account email and we’ll start recovery. 💌", { hold: 4000 });

    const modal =
        document.getElementById(
            "forgot-password-modal"
        );

    const emailInput =
        document.getElementById(
            "forgot-password-email"
        );

    const loginEmail =
        document.getElementById("email");

    const message =
        document.getElementById(
            "forgot-password-message"
        );

    if (message) {
        message.textContent = "";
    }

    if (emailInput && loginEmail) {
        emailInput.value =
            loginEmail.value.trim();
    }

    if (modal) {
        modal.classList.remove("hidden");
    }

}


function closeForgotPasswordModal() {

    const modal =
        document.getElementById(
            "forgot-password-modal"
        );

    const form =
        document.getElementById(
            "forgot-password-form"
        );

    const message =
        document.getElementById(
            "forgot-password-message"
        );

    if (modal) {
        modal.classList.add("hidden");
    }

    if (form) {
        form.reset();
    }

    if (message) {
        message.textContent = "";
    }

}


async function submitForgotPassword(event) {

    event.preventDefault();

    const email =
        document
            .getElementById(
                "forgot-password-email"
            )
            .value
            .trim();

    const message =
        document.getElementById(
            "forgot-password-message"
        );

    const submitButton =
        document.getElementById(
            "forgot-password-submit"
        );

    try {

        submitButton.disabled = true;
        submitButton.textContent =
            "Checking...";

        message.className =
            "text-sm text-center min-h-[20px] text-blue-600";

        message.textContent =
            "Checking account...";

        const response = await fetch(
            "/forgot-password",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    email
                })
            }
        );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Unable to process request."
            );

        }

        message.className =
            "text-sm text-center min-h-[20px] text-emerald-600";

        message.textContent =
            data.message;

    } catch (error) {

        console.error(
            "Forgot password error:",
            error
        );

        message.className =
            "text-sm text-center min-h-[20px] text-red-600";

        message.textContent =
            error.message;

    } finally {

        submitButton.disabled = false;
        submitButton.textContent =
            "Continue";

    }

}

/* =========================================
   NOTIFICATIONS
========================================= */

let notificationsLoaded = [];


async function loadNotifications() {

    const countBadge =
        document.getElementById(
            "notif-count"
        );

    const list =
        document.getElementById(
            "notification-list"
        );

    if (!countBadge || !list) return;

    if (
        currentRole !== "teacher" &&
        currentRole !== "student"
    ) {
        countBadge.classList.add("hidden");

        list.innerHTML = `
            <div class="p-6 text-sm text-gray-500 text-center">
                No notifications available.
            </div>
        `;

        return;
    }

    try {

        const response = await fetch(
            `/notifications/${currentUser.id}`
        );

        const data = await response.json();

        if (
            !response.ok ||
            !data.success
        ) {
            throw new Error(
                data.message ||
                "Failed to load notifications."
            );
        }

        notificationsLoaded =
            data.notifications || [];

        const unreadCount =
            Number(data.unread_count) || 0;

        countBadge.textContent =
            unreadCount > 99
                ? "99+"
                : unreadCount;

        if (unreadCount > 0) {
            countBadge.classList.remove("hidden");
        } else {
            countBadge.classList.add("hidden");
        }

        renderNotifications();

    } catch (error) {

        console.error(
            "Notification loading error:",
            error
        );

        list.innerHTML = `
            <div class="p-6 text-sm text-red-600 text-center">
                Failed to load notifications.
            </div>
        `;

    }

}


function renderNotifications() {

    const list =
        document.getElementById(
            "notification-list"
        );

    if (!list) return;

    if (notificationsLoaded.length === 0) {

        list.innerHTML = `
            <div class="p-8 text-center">

                <div class="text-4xl mb-3">
                    🔔
                </div>

                <p class="text-sm font-medium text-gray-700">
                    No notifications yet
                </p>

                <p class="text-xs text-gray-500 mt-1">
                    Grade updates and account requests will appear here.
                </p>

            </div>
        `;

        return;
    }

    list.innerHTML =
        notificationsLoaded
            .map(notification => {

                const isUnread =
                    Number(
                        notification.is_read
                    ) === 0;

                const type =
                    String(
                        notification.type || ""
                    )
                        .trim()
                        .toLowerCase();

                const isGradeNotification =
                    type === "official_grade";

                const iconClass =
                    isGradeNotification
                        ? "bg-blue-100 text-blue-600"
                        : "bg-amber-100 text-amber-600";

                const icon =
                    isGradeNotification
                        ? "fa-chart-line"
                        : "fa-key";

                const date =
                    new Date(
                        notification.created_at
                    );

                const formattedDate =
                    date.toLocaleString(
                        "en-PH",
                        {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit"
                        }
                    );

                return `
                    <button
                        type="button"
                        onclick="openNotification(${notification.id})"
                        class="w-full text-left px-5 py-4 border-b border-gray-100 hover:bg-gray-50 ${
                            isUnread
                                ? "bg-blue-50/60"
                                : "bg-white"
                        }"
                    >

                        <div class="flex items-start gap-3">

                            <div class="w-10 h-10 ${iconClass} rounded-2xl flex items-center justify-center shrink-0">
                                <i class="fa-solid ${icon}"></i>
                            </div>

                            <div class="flex-1 min-w-0">

                                <div class="flex items-center gap-2">

                                    <p class="text-sm font-semibold text-gray-900">
                                        ${escapeHTML(
                                            notification.title
                                        )}
                                    </p>

                                    ${
                                        isUnread
                                            ? `
                                                <span class="w-2 h-2 bg-blue-600 rounded-full"></span>
                                            `
                                            : ""
                                    }

                                </div>

                                <p class="text-sm text-gray-600 mt-1">
                                    ${escapeHTML(
                                        notification.message
                                    )}
                                </p>

                                <p class="text-xs text-gray-400 mt-2">
                                    ${formattedDate}
                                </p>

                            </div>

                        </div>

                    </button>
                `;

            })
            .join("");

}


async function toggleNotifications() {

    const dropdown =
        document.getElementById(
            "notification-dropdown"
        );

    if (!dropdown) return;

    const willOpen =
        dropdown.classList.contains(
            "hidden"
        );

    dropdown.classList.toggle(
        "hidden"
    );

    if (willOpen) {
        await loadNotifications();
    }

}


async function openNotification(notificationId) {

    const notification =
        notificationsLoaded.find(
            item =>
                Number(item.id) ===
                Number(notificationId)
        );

    if (!notification) {

        showMessagePopup(
            "Notification Unavailable",
            "This notification could not be found.",
            "error"
        );

        return;
    }

    if (
        Number(notification.is_read) === 0
    ) {

        try {

            const response = await fetch(
                `/notifications/${notificationId}/read`,
                {
                    method: "PUT",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        user_id:
                            currentUser.id
                    })
                }
            );

            const data =
                await response.json();

            if (
                response.ok &&
                data.success
            ) {
                notification.is_read = 1;
            }

        } catch (error) {

            console.error(
                "Mark notification read error:",
                error
            );

        }

    }

    const dropdown =
        document.getElementById(
            "notification-dropdown"
        );

    if (dropdown) {
        dropdown.classList.add("hidden");
    }

    const type =
        String(notification.type || "")
            .trim()
            .toLowerCase();

    if (type === "official_grade") {
        await loadNotifications();
        await navigateTo("grades");
        return;
    }

    if (type !== "password_reset") {
        await loadNotifications();

        showMessagePopup(
            notification.title || "Notification",
            notification.message ||
                "You have a new notification.",
            "success"
        );

        return;
    }

    const studentName =
        notification.actor_name ||
        "Unknown Student";

    const studentEmail =
        notification.actor_email ||
        "No email available";

    const sectionName =
        notification.section_name ||
        "No section";

    const shouldOpenStudents =
        await showConfirmPopup({

            title:
                "Password Reset Request",

            message:
                `${notification.message}\n\n` +
                `Student: ${studentName}\n` +
                `Email: ${studentEmail}\n` +
                `Section: ${sectionName}`,

            confirmText:
                "Manage Student",

            cancelText:
                "Close",

            type:
                "notification"

        });

    await loadNotifications();

    if (!shouldOpenStudents) {
        return;
    }

    await navigateTo("students");

}

let teacherSubmissions = [];
let selectedSubmissionForReview = null;


async function loadTeacherSubmissions() {

    const container =
        document.getElementById(
            "teacher-submissions-list"
        );

    if (!container) return;

    container.innerHTML = `
        <div class="bg-white border rounded-3xl p-8 text-gray-500">
            Loading submissions...
        </div>
    `;

    try {

        const response = await fetch(
            `/assignment-submissions/teacher/${currentUser.id}`
        );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Failed to load submissions."
            );

        }

        teacherSubmissions =
            data.submissions || [];

        renderTeacherSubmissions();

    } catch (error) {

        console.error(
            "Teacher submissions error:",
            error
        );

        container.innerHTML = `
            <div class="bg-red-50 text-red-600 rounded-3xl p-8">
                Failed to load student submissions.
            </div>
        `;

    }

}


function renderTeacherSubmissions() {

    const container =
        document.getElementById(
            "teacher-submissions-list"
        );

    const totalCount =
        document.getElementById(
            "submission-total-count"
        );

    const pendingCount =
        document.getElementById(
            "submission-pending-count"
        );

    const gradedCount =
        document.getElementById(
            "submission-graded-count"
        );

    const pending =
        teacherSubmissions.filter(
            item =>
                item.status === "submitted"
        ).length;

    const graded =
        teacherSubmissions.filter(
            item =>
                item.status === "graded"
        ).length;

    if (totalCount) {
        totalCount.textContent =
            teacherSubmissions.length;
    }

    if (pendingCount) {
        pendingCount.textContent =
            pending;
    }

    if (gradedCount) {
        gradedCount.textContent =
            graded;
    }

    if (!container) return;

    if (teacherSubmissions.length === 0) {

        container.innerHTML = `
            <div class="bg-white border rounded-3xl p-10 text-center">

                <div class="text-5xl mb-4">
                    📭
                </div>

                <h3 class="font-semibold text-gray-800">
                    No submissions yet
                </h3>

                <p class="text-sm text-gray-500 mt-2">
                    Student work will appear here after submission.
                </p>

            </div>
        `;

        return;
    }

    container.innerHTML =
        teacherSubmissions
            .map(submission => {

                const isGraded =
                    submission.status ===
                    "graded";

                return `
                    <div class="bg-white border border-gray-100 rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">

                        <div class="flex items-start gap-4">

                            <div class="w-12 h-12 ${
                                isGraded
                                    ? "bg-emerald-100 text-emerald-600"
                                    : "bg-amber-100 text-amber-600"
                            } rounded-2xl flex items-center justify-center text-xl shrink-0">

                                <i class="fa-solid ${
                                    isGraded
                                        ? "fa-check"
                                        : "fa-clock"
                                }"></i>

                            </div>

                            <div>

                                <h3 class="font-semibold text-lg text-gray-900">
                                    ${escapeHTML(
                                        submission.assignment_title
                                    )}
                                </h3>

                                <p class="text-sm text-gray-600 mt-1">
                                    ${escapeHTML(
                                        submission.student_name
                                    )}
                                    •
                                    ${escapeHTML(
                                        submission.section_name
                                    )}
                                </p>

                                <p class="text-xs text-gray-500 mt-2">
                                    Submitted:
                                    ${formatAssignmentDate(
                                        submission.submitted_at
                                    )}
                                </p>

                            </div>

                        </div>

                        <div class="flex items-center gap-3">

                            <span class="px-4 py-2 rounded-full text-xs font-semibold ${
                                isGraded
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-amber-100 text-amber-700"
                            }">

                                ${
                                    isGraded
                                        ? `${submission.score}%`
                                        : "Pending Review"
                                }

                            </span>

                            <button
                                type="button"
                                onclick="openSubmissionReview(${submission.id})"
                                class="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl text-sm font-medium"
                            >
                                ${
                                    isGraded
                                        ? "Review Grade"
                                        : "Grade"
                                }
                            </button>

                        </div>

                    </div>
                `;

            })
            .join("");

}


function openSubmissionReview(submissionId) {

    const submission =
        teacherSubmissions.find(
            item =>
                Number(item.id) ===
                Number(submissionId)
        );

    if (!submission) return;

    selectedSubmissionForReview =
        submission;

    document.getElementById(
        "review-submission-title"
    ).textContent =
        submission.assignment_title;

    document.getElementById(
        "review-submission-student"
    ).textContent =
        `${submission.student_name} • ${submission.section_name}`;

    document.getElementById(
        "review-submission-answer"
    ).textContent =
        submission.answer_text ||
        "No written answer was submitted.";

    document.getElementById(
        "review-submission-score"
    ).value =
        submission.score ?? "";

    document.getElementById(
        "review-submission-feedback"
    ).value =
        submission.feedback || "";

    const fileLink =
        document.getElementById(
            "review-submission-file"
        );

    if (submission.file) {

        fileLink.href =
            `/uploads/${submission.file}`;

        fileLink.classList.remove(
            "hidden"
        );

        fileLink.classList.add(
            "flex"
        );

    } else {

        fileLink.classList.add("hidden");
        fileLink.classList.remove("flex");

    }

    document.getElementById(
        "review-submission-message"
    ).textContent = "";

    document.getElementById(
        "submission-review-modal"
    ).classList.remove("hidden");

}


function closeSubmissionReviewModal() {

    document.getElementById(
        "submission-review-modal"
    ).classList.add("hidden");

    selectedSubmissionForReview =
        null;

}


async function saveSubmissionGrade(event) {

    event.preventDefault();

    if (!selectedSubmissionForReview) {
        return;
    }

    const scoreInput =
        document.getElementById(
            "review-submission-score"
        );

    const feedbackInput =
        document.getElementById(
            "review-submission-feedback"
        );

    const message =
        document.getElementById(
            "review-submission-message"
        );

    const button =
        document.getElementById(
            "save-submission-grade-button"
        );

    const score =
        Number(scoreInput.value);

    if (
        !Number.isFinite(score) ||
        score < 0 ||
        score > 100
    ) {

        message.textContent =
            "Please enter a score from 0 to 100.";

        message.className =
            "text-sm text-center min-h-[20px] text-red-600";

        return;
    }

    button.disabled = true;
    button.textContent =
        "Saving...";

    try {

        const response = await fetch(
            `/assignment-submissions/${selectedSubmissionForReview.id}/grade`,
            {
                method: "PUT",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    teacher_id:
                        currentUser.id,

                    score,

                    feedback:
                        feedbackInput.value.trim()
                })
            }
        );

        const data =
            await response.json();

        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.message ||
                "Failed to save grade."
            );

        }

        closeSubmissionReviewModal();

        showMessagePopup(
            "Grade Saved",
            "The student's grade and feedback were saved successfully.",
            "success"
        );

        await loadTeacherSubmissions();

    } catch (error) {

        console.error(
            "Save grade error:",
            error
        );

        message.textContent =
            error.message;

        message.className =
            "text-sm text-center min-h-[20px] text-red-600";

    } finally {

        button.disabled = false;
        button.textContent =
            "Save Grade";

    }

}
