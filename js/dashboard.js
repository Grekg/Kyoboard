(() => {
  const API_BASE = "http://localhost:3000/api";

  // Helper to get auth headers
  function getAuthHeaders() {
    const token = localStorage.getItem("kyoboard_token");
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  // DOM Elements
  const newBoardBtn = document.querySelector(".new-board-btn");
  const createFirstBtn = document.querySelector(".create-first-btn");
  const contentArea = document.querySelector(".content-area");
  const userProfile = document.querySelector(".sidebar .user-profile");
  const userName = userProfile?.querySelector(".name");
  const userEmail = userProfile?.querySelector(".role");
  const userAvatar = userProfile?.querySelector(".avatar");
  const searchInput = document.getElementById("search-input");

  // Modal elements
  const settingsModal = document.getElementById("settings-modal");
  const settingsForm = document.getElementById("settings-form");
  const settingsBtn = document.getElementById("settings-btn");
  const settingsClose = document.getElementById("settings-close");
  const settingsCancel = document.getElementById("settings-cancel");
  const settingsError = document.getElementById("settings-error");
  const settingsUsername = document.getElementById("settings-username");
  const settingsEmail = document.getElementById("settings-email");
  const settingsCurrentPassword = document.getElementById(
    "settings-current-password",
  );
  const settingsNewPassword = document.getElementById("settings-new-password");
  const settingsConfirmPassword = document.getElementById(
    "settings-confirm-password",
  );

  const deleteModal = document.getElementById("delete-modal");
  const deleteClose = document.getElementById("delete-close");
  const deleteCancel = document.getElementById("delete-cancel");
  const deleteConfirm = document.getElementById("delete-confirm");

  const logoutBtn = document.getElementById("logout-btn");

  // State
  let currentUser = null;
  let allBoards = [];
  let boardToDelete = null;

  // Initialize
  checkAuth();

  async function checkAuth() {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Not authenticated");
      }

      const { user } = await res.json();
      currentUser = user;
      localStorage.setItem("kyoboard_user", JSON.stringify(user));

      // Update UI with user info
      if (userName) userName.textContent = user.username;
      if (userEmail) userEmail.textContent = user.email;
      if (userAvatar) {
        userAvatar.textContent = user.username.substring(0, 2).toUpperCase();
      }

      // Load boards
      loadBoards();
    } catch (error) {
      console.error("Auth check failed:", error);
      window.location.href = "login.html";
    }
  }

  async function loadBoards() {
    try {
      const res = await fetch(`${API_BASE}/boards`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to load boards");

      const { boards } = await res.json();
      allBoards = boards;
      renderBoards(boards);
    } catch (error) {
      console.error("Load boards error:", error);
      showToast("Failed to load boards", "error");
    }
  }

  function renderBoards(boards) {
    let recentSection = contentArea.querySelector(".recent-boards-grid");

    // Clear existing empty state
    const emptyStates = contentArea.querySelectorAll(".empty-state-container");
    emptyStates.forEach((el) => el.remove());

    if (!recentSection) {
      recentSection = document.createElement("div");
      recentSection.className = "recent-boards-grid";
      const header = contentArea.querySelector(".welcome-header");
      if (header) {
        header.after(recentSection);
      } else {
        contentArea.appendChild(recentSection);
      }
    }

    recentSection.innerHTML = "";

    if (boards.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "empty-state-container";
      emptyDiv.innerHTML = `
        <div class="dashed-box">
          <p style="color: #6b7280; margin-bottom: 1rem;">No boards yet</p>
          <button class="btn btn-primary create-first-btn">Create your first board</button>
        </div>
      `;
      recentSection.after(emptyDiv);
      emptyDiv
        .querySelector(".create-first-btn")
        .addEventListener("click", createNewBoard);
      return;
    }

    // Render board cards
    boards.forEach((board) => {
      const card = createBoardCard(board);
      recentSection.appendChild(card);
    });
  }

  function createBoardCard(board) {
    const card = document.createElement("div");
    card.className = "board-card";
    card.style.cssText = `
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    `;

    const thumbnail = board.thumbnail || "";
    const updatedAt = new Date(board.updatedAt).toLocaleDateString();

    card.innerHTML = `
      <div class="board-card-actions">
        <button class="board-action-btn delete" title="Delete board" data-id="${board.id}">🗑️</button>
      </div>
      <div class="board-thumbnail" style="
        height: 160px;
        background: ${thumbnail ? `url(${thumbnail}) center/cover` : "linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)"};
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        ${!thumbnail ? '<span style="font-size: 3rem; opacity: 0.3;">🎨</span>' : ""}
      </div>
      <div class="board-info" style="padding: 1rem;">
        <h3 style="font-size: 1rem; margin: 0 0 0.5rem 0; color: #111827;">${escapeHtml(board.name)}</h3>
        <p style="font-size: 0.8rem; color: #6b7280; margin: 0;">Updated ${updatedAt}</p>
      </div>
    `;

    // Hover effects
    card.addEventListener("mouseenter", () => {
      card.style.transform = "translateY(-4px)";
      card.style.boxShadow = "0 8px 30px rgba(0, 0, 0, 0.1)";
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
      card.style.boxShadow = "";
    });

    // Click to open board
    card.addEventListener("click", (e) => {
      if (e.target.closest(".board-action-btn")) return;
      window.location.href = `board.html?id=${board.id}`;
    });

    // Delete button
    const deleteBtn = card.querySelector(".board-action-btn.delete");
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showDeleteModal(board);
    });

    return card;
  }

  async function createNewBoard() {
    try {
      const res = await fetch(`${API_BASE}/boards`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify({ name: "Untitled Board" }),
      });

      if (!res.ok) throw new Error("Failed to create board");

      const { board } = await res.json();
      window.location.href = `board.html?id=${board.id}`;
    } catch (error) {
      console.error("Create board error:", error);
      showToast("Failed to create board", "error");
    }
  }

  // Delete Modal
  function showDeleteModal(board) {
    boardToDelete = board;
    deleteModal.style.display = "flex";
  }

  function hideDeleteModal() {
    deleteModal.style.display = "none";
    boardToDelete = null;
  }

  async function confirmDelete() {
    if (!boardToDelete) return;

    try {
      const res = await fetch(`${API_BASE}/boards/${boardToDelete.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to delete board");

      hideDeleteModal();
      showToast("Board deleted successfully");
      loadBoards();
    } catch (error) {
      console.error("Delete board error:", error);
      showToast("Failed to delete board", "error");
    }
  }

  deleteClose?.addEventListener("click", hideDeleteModal);
  deleteCancel?.addEventListener("click", hideDeleteModal);
  deleteConfirm?.addEventListener("click", confirmDelete);
  deleteModal?.addEventListener("click", (e) => {
    if (e.target === deleteModal) hideDeleteModal();
  });

  // Settings Modal
  function showSettingsModal() {
    if (!currentUser) return;
    settingsUsername.value = currentUser.username || "";
    settingsEmail.value = currentUser.email || "";
    settingsCurrentPassword.value = "";
    settingsNewPassword.value = "";
    settingsConfirmPassword.value = "";
    settingsError.style.display = "none";
    settingsModal.style.display = "flex";
  }

  function hideSettingsModal() {
    settingsModal.style.display = "none";
  }

  settingsBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    showSettingsModal();
  });
  settingsClose?.addEventListener("click", hideSettingsModal);
  settingsCancel?.addEventListener("click", hideSettingsModal);
  settingsModal?.addEventListener("click", (e) => {
    if (e.target === settingsModal) hideSettingsModal();
  });

  settingsForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    settingsError.style.display = "none";

    const username = settingsUsername.value.trim();
    const email = settingsEmail.value.trim();
    const currentPassword = settingsCurrentPassword.value;
    const newPassword = settingsNewPassword.value;
    const confirmPassword = settingsConfirmPassword.value;

    // Validation
    if (!username || !email) {
      settingsError.textContent = "Username and email are required";
      settingsError.style.display = "block";
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      settingsError.textContent = "New passwords do not match";
      settingsError.style.display = "block";
      return;
    }

    if (newPassword && !currentPassword) {
      settingsError.textContent =
        "Current password is required to change password";
      settingsError.style.display = "block";
      return;
    }

    try {
      const body = { username, email };
      if (newPassword) {
        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }

      const res = await fetch(`${API_BASE}/users/me`, {
        method: "PUT",
        headers: getAuthHeaders(),
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update profile");
      }

      // Update local state
      currentUser = data.user;
      localStorage.setItem("kyoboard_user", JSON.stringify(data.user));

      if (userName) userName.textContent = data.user.username;
      if (userEmail) userEmail.textContent = data.user.email;
      if (userAvatar) {
        userAvatar.textContent = data.user.username
          .substring(0, 2)
          .toUpperCase();
      }

      hideSettingsModal();
      showToast(data.message || "Profile updated successfully");
    } catch (error) {
      console.error("Update profile error:", error);
      settingsError.textContent = error.message;
      settingsError.style.display = "block";
    }
  });

  // Logout
  logoutBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout error:", error);
    }
    localStorage.removeItem("kyoboard_user");
    localStorage.removeItem("kyoboard_token");
    window.location.href = "login.html";
  });

  // New Board buttons
  newBoardBtn?.addEventListener("click", createNewBoard);
  createFirstBtn?.addEventListener("click", createNewBoard);

  // Search
  searchInput?.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
      renderBoards(allBoards);
      return;
    }
    const filtered = allBoards.filter((b) =>
      b.name.toLowerCase().includes(query),
    );
    renderBoards(filtered);
  });

  // Toast notifications
  function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: ${type === "error" ? "#dc2626" : "#22c55e"};
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      z-index: 1001;
      animation: slideIn 0.3s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
})();
