(() => {
  const API_BASE =
    window.KYOBOARD_CONFIG?.API_BASE || "http://localhost:3000/api";
  const SOCKET_URL =
    window.KYOBOARD_CONFIG?.SOCKET_URL || "http://localhost:3000";

  // Get board ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const boardId = urlParams.get("id");

  if (!boardId) {
    alert("No board ID specified. Redirecting to dashboard.");
    window.location.href = "dashboard.html";
    return;
  }

  // Client identification
  const clientId = Math.random().toString(36).slice(2, 9);

  // User state
  let currentUser = null;
  let socket = null;

  // DOM Elements
  const viewport = document.getElementById("viewport");
  const canvas = document.getElementById("board");
  const filesLayer = document.getElementById("files-layer");
  const usernameEl = document.getElementById("username");
  const boardNameInput = document.querySelector(".meta-title");
  const userProfileImg = document.querySelector(".user-profile img");

  // Toolbar buttons
  const penBtn = document.getElementById("pen");
  const eraserBtn = document.getElementById("eraser");
  const clearBtn = document.getElementById("clear");
  const fileInput = document.getElementById("file");
  const addNoteBtn = document.getElementById("add-note");
  const addCardBtn = document.getElementById("add-card");
  const addTextBtn = document.getElementById("add-text");
  const panBtn = document.getElementById("pan-tool");
  const selectBtn = document.getElementById("select");

  // Menus & Pickers
  const penMenu = document.getElementById("pen-menu");
  const eraserMenu = document.getElementById("eraser-menu");
  const textMenu = document.getElementById("text-menu");
  const penSizeSlider = document.getElementById("pen-size-slider");
  const eraserSizeSlider = document.getElementById("eraser-size-slider");
  const colorSwatches = document.querySelectorAll(
    ".color-swatch:not(.custom-color-label)",
  );
  const customColorPicker = document.getElementById("custom-color-picker");

  // Zoom
  const zoomInBtn = document.getElementById("zoom-in");
  const zoomOutBtn = document.getElementById("zoom-out");
  const zoomVal = document.getElementById("zoom-val");

  // Chat elements
  const chatInput = document.getElementById("chat-input");
  const sendMsgBtn = document.getElementById("send-msg");
  const messagesEl = document.getElementById("messages");

  // Shared notes
  const sharedNotesArea = document.getElementById("shared-notes-area");

  // Viewport state
  let scale = 1;
  let panX = 0;
  let panY = 0;

  // Drawing state
  const ctx = canvas.getContext("2d");
  let currentColor = "#000000";
  let currentSize = 3;
  let currentEraserSize = 20;
  let drawing = false;
  let last = null;
  let tool = "pan";
  let isPanning = false;
  let lastPan = { x: 0, y: 0 };

  // Virtual canvas size
  const VIRTUAL_W = 4000;
  const VIRTUAL_H = 4000;

  // Live cursors
  const cursors = {};

  // Helper to get auth headers
  function getAuthHeaders() {
    const token = localStorage.getItem("kyoboard_token");
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  // Initialize
  init();

  async function init() {
    // Check authentication
    try {
      const token = localStorage.getItem("kyoboard_token");
      if (!token) {
        throw new Error("No token");
      }

      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Not authenticated");
      const data = await res.json();
      currentUser = data.user;

      // Update UI
      if (usernameEl) usernameEl.value = currentUser.username;
      if (userProfileImg && currentUser.avatarUrl) {
        userProfileImg.src = currentUser.avatarUrl;
      }
    } catch (error) {
      console.error("Auth error:", error);
      // Save current URL to redirect back after login
      localStorage.setItem("redirect_after_login", window.location.href);
      window.location.href = "login.html";
      return;
    }

    // Initialize canvas
    resize();
    window.addEventListener("resize", resize);

    // Center viewport
    const rect = document.getElementById("board-wrap").getBoundingClientRect();
    panX = -(VIRTUAL_W - rect.width) / 2;
    panY = -(VIRTUAL_H - rect.height) / 2;
    updateViewport();

    // Connect to Socket.io
    connectSocket();

    // Setup event listeners
    setupToolbar();
    setupDrawing();
    setupChat();
    setupNotes();
    setupBoardName();
    setupShare();
  }

  function setupShare() {
    const btnShare = document.getElementById("btn-share");
    if (!btnShare) return;

    btnShare.addEventListener("click", () => {
      const url = window.location.href;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(url)
          .then(() => {
            showToast("Link copied!");
          })
          .catch((err) => {
            console.error("Clipboard API failed: ", err);
            fallbackCopy(url);
          });
      } else {
        fallbackCopy(url);
      }
    });
  }

  function fallbackCopy(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      const successful = document.execCommand("copy");
      if (successful) showToast("Link copied!");
      else showToast("Failed to copy link.", true);
    } catch (err) {
      console.error("Fallback copy failed", err);
      showToast("Failed to copy link.", true);
    }
    document.body.removeChild(textArea);
  }

  function showToast(message, isError = false) {
    const toast = document.createElement("div");
    toast.className = "toast-notification";
    toast.innerText = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${isError ? "#ef4444" : "#10b981"};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 1000;
        font-family: 'Inter', sans-serif;
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.3s ease;
      `;
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(20px)";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function connectSocket() {
    const token = localStorage.getItem("kyoboard_token");

    socket = io(SOCKET_URL, {
      withCredentials: true,
      auth: {
        token: token,
      },
    });

    socket.on("connect", () => {
      console.log("Connected to server");
      socket.emit("join-board", boardId);
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });

    socket.on("board-state", (data) => {
      console.log("Received board state:", data);

      // Set board name
      if (boardNameInput && data.board.name) {
        boardNameInput.value = data.board.name;
      }

      // Load canvas state
      if (data.board.canvasState) {
        loadCanvasState(data.board.canvasState);
      }

      // Load shared notes
      if (sharedNotesArea && data.notes) {
        sharedNotesArea.value = data.notes;
      }

      // Load chat messages
      if (data.messages) {
        messagesEl.innerHTML = "";
        data.messages.forEach((msg) => appendChatMessage(msg));
      }

      // Show active users
      if (data.users) {
        console.log("Active users:", data.users);
      }
    });

    socket.on("user-joined", (data) => {
      console.log("User joined:", data.username);
      appendSystemMessage(`${data.username} joined the board`);
    });

    socket.on("user-left", (data) => {
      console.log("User left:", data.username);
      appendSystemMessage(`${data.username} left the board`);
      // Remove their cursor
      if (cursors[data.odId]) {
        cursors[data.odId].remove();
        delete cursors[data.odId];
      }
    });

    socket.on("cursor-update", (data) => {
      updateRemoteCursor(data);
    });

    socket.on("canvas-stroke", (data) => {
      drawSegment(data, false);
    });

    socket.on("canvas-element", (data) => {
      insertElement(data);
    });

    socket.on("canvas-element-update", (data) => {
      handleElementUpdate(data);
    });

    socket.on("canvas-clear", () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      filesLayer.innerHTML = "";
    });

    socket.on("chat-message", (data) => {
      appendChatMessage(data);
    });

    socket.on("notes-update", (data) => {
      if (sharedNotesArea && document.activeElement !== sharedNotesArea) {
        sharedNotesArea.value = data.content;
      }
    });

    socket.on("board-name-update", (data) => {
      if (boardNameInput && document.activeElement !== boardNameInput) {
        boardNameInput.value = data.name;
      }
    });

    socket.on("error", (data) => {
      console.error("Socket error:", data.message);
      alert(data.message);
    });
  }

  function resize() {
    const rect = document.getElementById("board-wrap").getBoundingClientRect();
    canvas.width = VIRTUAL_W;
    canvas.height = VIRTUAL_H;
    return rect;
  }

  function updateViewport() {
    viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    if (zoomVal) zoomVal.innerText = Math.round(scale * 100) + "%";
  }

  function loadCanvasState(state) {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    filesLayer.innerHTML = "";

    // Redraw strokes
    if (state.strokes) {
      state.strokes.forEach((stroke) => {
        drawSegment(stroke, false);
      });
    }

    // Recreate elements
    if (state.elements) {
      state.elements.forEach((element) => {
        insertElement(element);
      });
    }
  }

  // =====================
  // DRAWING FUNCTIONS
  // =====================

  function drawSegment(data, isLocal = false) {
    const { from, to, color, size, toolType } = data;
    if (!from || !to) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = size || 2;

    if (toolType === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color || "#000000";
    }

    ctx.beginPath();
    ctx.moveTo(from.x * VIRTUAL_W, from.y * VIRTUAL_H);
    ctx.lineTo(to.x * VIRTUAL_W, to.y * VIRTUAL_H);
    ctx.stroke();
    ctx.restore();
  }

  function posFromEvent(e) {
    const boardWrap = document.getElementById("board-wrap");
    const rect = boardWrap.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    const worldX = (relX - panX) / scale;
    const worldY = (relY - panY) / scale;

    return {
      x: worldX / VIRTUAL_W,
      y: worldY / VIRTUAL_H,
    };
  }

  // =====================
  // CURSOR FUNCTIONS
  // =====================

  function updateRemoteCursor(data) {
    if (!cursors[data.odId]) {
      const cursor = document.createElement("div");
      cursor.className = "cursor";
      cursor.innerHTML = `
        <svg class="cursor-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px;">
          <path d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z" fill="${data.color || "#2563EB"}" stroke="white" stroke-width="2"/>
        </svg>
        <div class="cursor-label" style="
          background: ${data.color || "#2563EB"};
          color: white;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
          margin-top: 2px;
          white-space: nowrap;
        ">${data.username}</div>
      `;
      cursor.style.cssText =
        "position: absolute; pointer-events: none; z-index: 100;";
      filesLayer.appendChild(cursor);
      cursors[data.odId] = cursor;
    }

    const el = cursors[data.odId];
    el.style.left = data.x * VIRTUAL_W + "px";
    el.style.top = data.y * VIRTUAL_H + "px";
  }

  // =====================
  // SETUP FUNCTIONS
  // =====================

  function setupToolbar() {
    // Tool switching
    function setActiveTool(t, btn) {
      if (tool === t && btn?.classList.contains("active")) {
        if (t === "pen") penMenu?.classList.toggle("hidden");
        if (t === "eraser") eraserMenu?.classList.toggle("hidden");
        if (t === "text") textMenu?.classList.toggle("hidden");
        return;
      }

      penMenu?.classList.add("hidden");
      eraserMenu?.classList.add("hidden");
      textMenu?.classList.add("hidden");

      tool = t;
      document
        .querySelectorAll(".btn-tool")
        .forEach((b) => b.classList.remove("active"));
      if (btn) btn.classList.add("active");

      const boardWrap = document.getElementById("board-wrap");
      boardWrap.style.cursor = t === "pan" ? "grab" : "crosshair";
    }

    penBtn?.addEventListener("click", () => setActiveTool("pen", penBtn));
    eraserBtn?.addEventListener("click", () =>
      setActiveTool("eraser", eraserBtn),
    );
    panBtn?.addEventListener("click", () => setActiveTool("pan", panBtn));
    selectBtn?.addEventListener("click", () =>
      setActiveTool("select", selectBtn),
    );

    // Color swatches
    colorSwatches.forEach((swatch) => {
      swatch.addEventListener("click", () => {
        colorSwatches.forEach((s) => s.classList.remove("active"));
        document
          .querySelector(".custom-color-label")
          ?.classList.remove("active");
        swatch.classList.add("active");
        currentColor = swatch.dataset.color;
      });
    });

    customColorPicker?.addEventListener("input", (e) => {
      currentColor = e.target.value;
      colorSwatches.forEach((s) => s.classList.remove("active"));
      const label = document.querySelector(".custom-color-label");
      if (label) {
        label.style.background = currentColor;
        label.classList.add("active");
      }
    });

    penSizeSlider?.addEventListener("input", (e) => {
      currentSize = parseInt(e.target.value, 10);
    });

    eraserSizeSlider?.addEventListener("input", (e) => {
      currentEraserSize = parseInt(e.target.value, 10);
    });

    // Zoom
    zoomInBtn?.addEventListener("click", () => applyZoom(0.1));
    zoomOutBtn?.addEventListener("click", () => applyZoom(-0.1));

    // Clear
    clearBtn?.addEventListener("click", () => {
      if (confirm("Clear the entire board?")) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        filesLayer.innerHTML = "";
        socket?.emit("canvas-clear");
      }
    });

    // Add elements
    addNoteBtn?.addEventListener("click", () =>
      addElement("sticky", { content: "New Note" }),
    );
    addCardBtn?.addEventListener("click", () =>
      addElement("card", { title: "Title", content: "Details" }),
    );
    addTextBtn?.addEventListener("click", () =>
      addElement("text", { content: "Text" }),
    );

    // File upload
    fileInput?.addEventListener("change", (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        addElement("image", { name: f.name, data: reader.result });
      };
      reader.readAsDataURL(f);
    });
  }

  function applyZoom(delta) {
    const newScale = Math.max(0.2, Math.min(3, scale + delta));
    scale = newScale;
    updateViewport();
  }

  function setupDrawing() {
    const boardWrap = document.getElementById("board-wrap");
    let lastCursorTime = 0;

    // Broadcast cursor position
    boardWrap.addEventListener("pointermove", (e) => {
      const now = Date.now();
      if (now - lastCursorTime < 50) return; // Throttle 50ms
      lastCursorTime = now;

      const pos = posFromEvent(e);
      if (pos.x >= 0 && pos.x <= 1 && pos.y >= 0 && pos.y <= 1) {
        socket?.emit("cursor-move", {
          x: pos.x,
          y: pos.y,
          color: "#2563EB",
        });
      }
    });

    // Pointer down
    boardWrap.addEventListener("pointerdown", (e) => {
      if (
        e.target.closest(".btn-tool") ||
        e.target.closest("#sidebar-right") ||
        e.target.closest(".tool-flyout") ||
        e.target.closest("#top-bar") ||
        e.target.closest("#bottom-bar")
      ) {
        return;
      }

      if (tool === "pan") {
        isPanning = true;
        lastPan = { x: e.clientX, y: e.clientY };
        boardWrap.setPointerCapture(e.pointerId);
        boardWrap.style.cursor = "grabbing";
        e.preventDefault();
        return;
      }

      if (e.target.closest(".element-item")) return;

      if (tool === "pen" || tool === "eraser") {
        drawing = true;
        last = posFromEvent(e);
        e.preventDefault();
      }
    });

    // Pointer up
    window.addEventListener("pointerup", (e) => {
      drawing = false;
      last = null;

      if (isPanning) {
        isPanning = false;
        try {
          boardWrap.releasePointerCapture(e.pointerId);
        } catch (err) {}
        boardWrap.style.cursor = tool === "pan" ? "grab" : "crosshair";
      }
    });

    // Pointer move
    window.addEventListener("pointermove", (e) => {
      if (isPanning) {
        const dx = e.clientX - lastPan.x;
        const dy = e.clientY - lastPan.y;
        panX += dx;
        panY += dy;
        lastPan = { x: e.clientX, y: e.clientY };
        updateViewport();
        return;
      }

      if (!drawing) return;

      const p = posFromEvent(e);
      const color = currentColor;
      const size = tool === "eraser" ? currentEraserSize : currentSize;

      const strokeData = { from: last, to: p, color, size, toolType: tool };
      drawSegment(strokeData, true);
      socket?.emit("canvas-stroke", strokeData);

      last = p;
    });

    // Mouse wheel zoom
    boardWrap.addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey) {
          e.preventDefault();
          applyZoom(e.deltaY > 0 ? -0.1 : 0.1);
        }
      },
      { passive: false },
    );
  }

  function setupChat() {
    function sendMessage() {
      const text = chatInput?.value.trim();
      if (!text) return;
      socket?.emit("chat-message", text);
      chatInput.value = "";
    }

    sendMsgBtn?.addEventListener("click", sendMessage);
    chatInput?.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  function appendChatMessage(msg) {
    if (!messagesEl) return;

    const div = document.createElement("div");
    div.className = "chat-msg";
    div.style.cssText = `
      padding: 0.5rem;
      margin-bottom: 0.5rem;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
    `;
    div.innerHTML = `
      <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-main);">${escapeHtml(msg.user?.username || "Unknown")}</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 2px;">${escapeHtml(msg.content)}</div>
      <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">${formatTime(msg.createdAt)}</div>
    `;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendSystemMessage(text) {
    if (!messagesEl) return;

    const div = document.createElement("div");
    div.className = "system-msg";
    div.style.cssText = `
      padding: 0.25rem 0.5rem;
      margin-bottom: 0.5rem;
      font-size: 0.75rem;
      color: var(--text-muted);
      text-align: center;
      font-style: italic;
    `;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function setupNotes() {
    let notesDebounce = null;

    sharedNotesArea?.addEventListener("input", () => {
      clearTimeout(notesDebounce);
      notesDebounce = setTimeout(() => {
        socket?.emit("notes-update", sharedNotesArea.value);
      }, 300);
    });
  }

  function setupBoardName() {
    let nameDebounce = null;

    boardNameInput?.addEventListener("input", () => {
      clearTimeout(nameDebounce);
      nameDebounce = setTimeout(() => {
        socket?.emit("board-name-update", boardNameInput.value);
      }, 500);
    });
  }

  // =====================
  // ELEMENT FUNCTIONS
  // =====================

  function addElement(type, args) {
    const id = Math.random().toString(36).slice(2, 9);
    const boardWrap = document.getElementById("board-wrap");
    const rect = boardWrap.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const worldX = (centerX - panX) / scale;
    const worldY = (centerY - panY) / scale;

    const msg = {
      type: "element",
      kind: type,
      id,
      left: worldX - 50,
      top: worldY - 20,
      ...args,
    };

    insertElement(msg);
    socket?.emit("canvas-element", msg);
  }

  function insertElement(msg) {
    if (msg.id && document.querySelector(`.element-item[data-id="${msg.id}"]`))
      return;

    const wrap = document.createElement("div");
    wrap.className = `element-item ${
      msg.kind === "sticky"
        ? "note-item"
        : msg.kind === "card"
          ? "card-item"
          : "file-item"
    }`;
    wrap.setAttribute(
      "data-id",
      msg.id || Math.random().toString(36).slice(2, 9),
    );
    wrap.style.left = (msg.left || 40) + "px";
    wrap.style.top = (msg.top || 40) + "px";
    wrap.style.position = "absolute";

    // Drag handle
    const dragHandle = document.createElement("div");
    dragHandle.className = "drag-handle";
    wrap.appendChild(dragHandle);

    // Content
    if (msg.kind === "image") {
      const img = document.createElement("img");
      if (msg.data) img.src = msg.data;
      img.style.width = msg.width ? msg.width + "px" : "200px";
      wrap.appendChild(img);
    } else if (msg.kind === "sticky" || msg.kind === "text") {
      const content = document.createElement("div");
      content.className = "note-content";
      content.contentEditable = true;
      content.innerText =
        msg.content || (msg.kind === "sticky" ? "New Note" : "Text");
      if (msg.kind === "text") {
        wrap.style.background = "transparent";
        wrap.style.color = "#fff";
        wrap.style.boxShadow = "none";
        content.style.fontSize = "24px";
      }
      wrap.appendChild(content);

      content.addEventListener("input", () => {
        socket?.emit("canvas-element-update", {
          id: msg.id,
          content: content.innerText,
        });
      });
    } else if (msg.kind === "card") {
      const header = document.createElement("div");
      header.className = "card-header";
      header.innerHTML = `<span>${msg.title || "Title"}</span>`;
      header.style.cursor = "grab";
      dragHandle.style.display = "none";
      header.classList.add("custom-drag-handle");
      wrap.appendChild(header);

      const body = document.createElement("div");
      body.className = "card-body";
      body.contentEditable = true;
      body.innerText = msg.content || "Description";
      wrap.appendChild(body);

      body.addEventListener("input", () => {
        socket?.emit("canvas-element-update", {
          id: msg.id,
          content: body.innerText,
        });
      });
    }

    // Resize handle
    const resize = document.createElement("div");
    resize.className = "resize-handle";
    resize.style.cssText = `
      position: absolute;
      right: 0;
      bottom: 0;
      width: 16px;
      height: 16px;
      cursor: nwse-resize;
      background: rgba(0,0,0,0.2);
      z-index: 20;
    `;
    wrap.appendChild(resize);

    makeDraggableResizable(wrap, dragHandle, resize);

    if (msg.kind === "card") {
      const header = wrap.querySelector(".card-header");
      makeDraggableResizable(wrap, header, resize);
    }

    filesLayer.appendChild(wrap);
  }

  function handleElementUpdate(msg) {
    const el = document.querySelector(`[data-id="${msg.id}"]`);
    if (!el) return;

    if (msg.left !== undefined) el.style.left = msg.left + "px";
    if (msg.top !== undefined) el.style.top = msg.top + "px";
    if (msg.width !== undefined) {
      el.style.width = msg.width + "px";
      const img = el.querySelector("img");
      if (img) img.style.width = "100%";
    }
    if (msg.content !== undefined) {
      const contentEl = el.querySelector("[contenteditable]");
      if (contentEl && document.activeElement !== contentEl) {
        contentEl.innerText = msg.content;
      }
    }
  }

  function makeDraggableResizable(el, dragTrigger, resizeTrigger) {
    el.style.touchAction = "none";
    let dragging = false;
    let resizing = false;
    let startX = 0,
      startY = 0,
      startLeft = 0,
      startTop = 0,
      startW = 0;

    function onDown(e) {
      if (e.button !== 0) return;

      if (e.target === resizeTrigger) {
        e.preventDefault();
        e.stopPropagation();
        resizing = true;
        resizeTrigger.setPointerCapture(e.pointerId);
        startX = e.clientX;
        startW = parseFloat(el.style.width) || el.offsetWidth;
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        return;
      }

      if (
        e.target === dragTrigger ||
        e.target.closest(".drag-handle") ||
        e.target.closest(".custom-drag-handle")
      ) {
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        dragTrigger.setPointerCapture(e.pointerId);
        el.classList.add("dragging");
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseFloat(el.style.left) || 0;
        startTop = parseFloat(el.style.top) || 0;
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      }
    }

    function onMove(e) {
      if (dragging) {
        const dxScreen = e.clientX - startX;
        const dyScreen = e.clientY - startY;
        const dxWorld = dxScreen / scale;
        const dyWorld = dyScreen / scale;
        el.style.left = startLeft + dxWorld + "px";
        el.style.top = startTop + dyWorld + "px";
      }
      if (resizing) {
        const dxScreen = e.clientX - startX;
        const dxWorld = dxScreen / scale;
        const newW = Math.max(50, startW + dxWorld);
        el.style.width = newW + "px";
      }
    }

    function onUp(e) {
      const id = el.getAttribute("data-id");

      if (dragging) {
        dragging = false;
        try {
          dragTrigger.releasePointerCapture(e.pointerId);
        } catch (err) {}
        el.classList.remove("dragging");
        socket?.emit("canvas-element-update", {
          id,
          left: parseFloat(el.style.left),
          top: parseFloat(el.style.top),
        });
      }

      if (resizing) {
        resizing = false;
        try {
          resizeTrigger.releasePointerCapture(e.pointerId);
        } catch (err) {}
        socket?.emit("canvas-element-update", {
          id,
          width: parseFloat(el.style.width),
        });
      }

      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    if (dragTrigger) dragTrigger.addEventListener("pointerdown", onDown);
    if (resizeTrigger) resizeTrigger.addEventListener("pointerdown", onDown);
  }

  // =====================
  // UTILITY FUNCTIONS
  // =====================

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function formatTime(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // Cleanup on page unload
  window.addEventListener("beforeunload", () => {
    socket?.emit("leave-board");
  });
})();
