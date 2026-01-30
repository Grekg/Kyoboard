(() => {
  const API_BASE = "http://localhost:3000/api";

  // DOM Elements
  const newBoardBtn = document.querySelector(".new-board-btn");
  const contentArea = document.querySelector(".content-area");
  const userProfile = document.querySelector(".sidebar .user-profile");
  const userName = userProfile?.querySelector(".name");
  const userEmail = userProfile?.querySelector(".role");
  const userAvatar = userProfile?.querySelector(".avatar");

  // Check authentication
  checkAuth();

  async function checkAuth() {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Not authenticated");
      }

      const { user } = await res.json();
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
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to load boards");

      const { boards } = await res.json();
      renderBoards(boards);
    } catch (error) {
      console.error("Load boards error:", error);
      showError("Failed to load boards");
    }
  }

  function renderBoards(boards) {
    // Find or create the boards container
    let recentSection = contentArea.querySelector(".recent-boards-grid");

    // Clear existing empty state
    const emptyStates = contentArea.querySelectorAll(".empty-state-container");
    emptyStates.forEach((el) => el.remove());

    // Update "Recent Boards" header
    const headers = contentArea.querySelectorAll(".welcome-header");
    const recentHeader = Array.from(headers).find((h) =>
      h.querySelector("h2")?.textContent.includes("Recent"),
    );

    if (!recentSection) {
      recentSection = document.createElement("div");
      recentSection.className = "recent-boards-grid";
      recentSection.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 1.5rem;
        margin-top: 1rem;
      `;
      if (recentHeader) {
        recentHeader.after(recentSection);
      } else {
        contentArea.appendChild(recentSection);
      }
    }

    recentSection.innerHTML = "";

    if (boards.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "empty-state-container";
      emptyDiv.innerHTML = `
        <div class="dashed-box" style="
          border: 2px dashed var(--border-color);
          padding: 3rem;
          border-radius: 12px;
          text-align: center;
          grid-column: 1 / -1;
        ">
          <p style="color: var(--text-muted); margin-bottom: 1rem;">No boards yet</p>
          <button class="btn btn-primary create-first-btn">Create your first board</button>
        </div>
      `;
      recentSection.appendChild(emptyDiv);

      // Add click handler
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
      background: var(--glass-bg, rgba(255, 255, 255, 0.05));
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
      border-radius: 12px;
      overflow: hidden;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    `;

    const thumbnail = board.thumbnail || "";
    const updatedAt = new Date(board.updatedAt).toLocaleDateString();

    card.innerHTML = `
      <div class="board-thumbnail" style="
        height: 160px;
        background: ${thumbnail ? `url(${thumbnail}) center/cover` : "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)"};
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        ${!thumbnail ? '<span style="font-size: 3rem; opacity: 0.3;">🎨</span>' : ""}
      </div>
      <div class="board-info" style="padding: 1rem;">
        <h3 style="font-size: 1rem; margin: 0 0 0.5rem 0; color: var(--text-main);">${escapeHtml(board.name)}</h3>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0;">Updated ${updatedAt}</p>
      </div>
    `;

    // Hover effects
    card.addEventListener("mouseenter", () => {
      card.style.transform = "translateY(-4px)";
      card.style.boxShadow = "0 8px 30px rgba(0, 0, 0, 0.3)";
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
      card.style.boxShadow = "";
    });

    // Click to open board
    card.addEventListener("click", () => {
      window.location.href = `board.html?id=${board.id}`;
    });

    return card;
  }

  async function createNewBoard() {
    try {
      const res = await fetch(`${API_BASE}/boards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: "Untitled Board" }),
      });

      if (!res.ok) throw new Error("Failed to create board");

      const { board } = await res.json();
      window.location.href = `board.html?id=${board.id}`;
    } catch (error) {
      console.error("Create board error:", error);
      showError("Failed to create board");
    }
  }

  // New Board button handler
  if (newBoardBtn) {
    newBoardBtn.addEventListener("click", createNewBoard);
  }

  // Logout handler (Settings menu could have this)
  const settingsLink = document.querySelector('.nav-item[title="Settings"]');
  if (settingsLink) {
    settingsLink.addEventListener("click", async (e) => {
      e.preventDefault();
      if (confirm("Log out of Kyoboard?")) {
        try {
          await fetch(`${API_BASE}/auth/logout`, {
            method: "POST",
            credentials: "include",
          });
          localStorage.removeItem("kyoboard_user");
          window.location.href = "login.html";
        } catch (error) {
          console.error("Logout error:", error);
        }
      }
    });
  }

  function showError(message) {
    const toast = document.createElement("div");
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(239, 68, 68, 0.9);
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      z-index: 1000;
      animation: slideIn 0.3s ease;
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
