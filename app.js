(() => {
  // client whiteboard
  const clientId = Math.random().toString(36).slice(2, 9);

  // dom elements
  const viewport = document.getElementById("viewport");
  const canvas = document.getElementById("board");
  const filesLayer = document.getElementById("files-layer");
  const colorEl = document.getElementById("color");
  const sizeEl = document.getElementById("size");
  const usernameEl = document.getElementById("username");

  // toolbar btns
  const penBtn = document.getElementById("pen");
  const eraserBtn = document.getElementById("eraser");
  const clearBtn = document.getElementById("clear");
  const fileInput = document.getElementById("file");
  const addNoteBtn = document.getElementById("add-note");
  const addCardBtn = document.getElementById("add-card");
  const addTextBtn = document.getElementById("add-text");
  const panBtn = document.getElementById("pan-tool");

  // menus
  const penMenu = document.getElementById("pen-menu");
  const eraserMenu = document.getElementById("eraser-menu");
  const penSizeSlider = document.getElementById("pen-size-slider");
  const eraserSizeSlider = document.getElementById("eraser-size-slider");
  const colorSwatches = document.querySelectorAll(
    ".color-swatch:not(.custom-color-label)",
  );
  const customColorPicker = document.getElementById("custom-color-picker");

  // top bar
  const shareBtn = document.getElementById("btn-share");
  const settingsBtn = document.getElementById("btn-settings");
  const notifBtn = document.getElementById("btn-notifications");
  const boardNameInput = document.getElementById("board-name-input");

  // zoom
  const zoomInBtn = document.getElementById("zoom-in");
  const zoomOutBtn = document.getElementById("zoom-out");
  const zoomVal = document.getElementById("zoom-val");

  // chat
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const messagesEl = document.getElementById("messages");

  // tabs
  const tabBtns = document.querySelectorAll(".tab-btn");
  const notesPanel = document.getElementById("notes-panel");
  const chatPanel = document.getElementById("chat-panel");

  // viewport state
  let scale = 1;
  let panX = 0;
  let panY = 0;

  // drawing state
  const ctx = canvas.getContext("2d");
  let currentColor = "#ffffff";
  let currentSize = 3;
  let currentEraserSize = 20;
  let drawing = false;
  let last = null;
  let tool = "pen";
  let isPanning = false;
  let lastPan = { x: 0, y: 0 };

  function resize() {
    const rect = document.getElementById("board-wrap").getBoundingClientRect();
    // temp match window size
    canvas.width = rect.width;
    canvas.height = rect.height;
  }
  window.addEventListener("resize", resize);
  resize();

  function updateViewport() {
    viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    zoomVal.innerText = Math.round(scale * 100) + "%";
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  // ws connect
  const wsProto = location.protocol === "https:" ? "wss" : "ws";
  const wsHost = `${location.hostname}:3000`;
  const ws = new WebSocket(`${wsProto}://${wsHost}`);

  // socket io
  let sio;
  try {
    if (typeof io !== "undefined") {
      sio = io();
      sio.on("connect", () => {
        sio.emit("join", usernameEl.value || "Guest");
      });

      // show chat msgs
      sio.on("chat message", (payload) => {
        if (!messagesEl) return;
        const div = document.createElement("div");
        div.className = "chat-msg";
        div.textContent = `${payload.name || "Guest"}: ${payload.text}`;
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      });

      if (chatForm) {
        chatForm.addEventListener("submit", (e) => {
          e.preventDefault();
          const txt = chatInput.value.trim();
          if (!txt) return;
          sio.emit("chat message", txt);
          chatInput.value = "";
          if (chatPanel.style.display === "none") {
            const chatTab = document.querySelector('[data-tab="chat"]');
            if (chatTab) chatTab.click();
          }
        });
      }
    }
  } catch (err) {
    console.warn("Socket.IO not available", err);
  }

  ws.addEventListener("open", () => {
    send({ type: "join", clientId, name: usernameEl.value || "Guest" });
  });

  ws.addEventListener("message", (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.clientId === clientId) return; 
      handleRemote(msg);
    } catch (e) {
      console.warn("invalid ws message", e);
    }
  });

  function handleRemote(msg) {
    switch (msg.type) {
      case "draw":
        drawSegment(msg, false);
        break;
      case "clear":
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        break;
      case "element":
        insertElement(msg);
        break;
      case "element-update":
        handleElementUpdate(msg);
        break;
      case "cursor":
        updateCursor(msg);
        break;
    }
  }

  // cursors
  const cursors = {};
  function updateCursor(msg) {
    if (!cursors[msg.clientId]) {
      const cursor = document.createElement("div");
      cursor.className = "cursor";
      cursor.innerHTML = `
            <svg class="cursor-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z" fill="${
                  msg.color || "#2563EB"
                }" stroke="white" stroke-width="2"/>
            </svg>
            <div class="cursor-label" style="background: ${
              msg.color || "#2563EB"
            }">${msg.name}</div>
          `;
      filesLayer.appendChild(cursor);
      cursors[msg.clientId] = cursor;
    }

    const el = cursors[msg.clientId];
    // map to canvas
    el.style.left = msg.x * canvas.width + "px";
    el.style.top = msg.y * canvas.height + "px";
    el.style.position = "absolute";
    el.style.transform = "none"; 
  }

  // broadcast cursor
  const boardWrap = document.getElementById("board-wrap");
  let lastCursorTime = 0;
  boardWrap.addEventListener("pointermove", (e) => {
    const now = Date.now();
    if (now - lastCursorTime < 50) return; // throttle
    lastCursorTime = now;

    // get world coords
    const rect = boardWrap.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    // world space
    const worldX = (clientX - panX) / scale;
    const worldY = (clientY - panY) / scale;

    const normX = worldX / canvas.width;
    const normY = worldY / canvas.height;

    if (normX >= 0 && normX <= 1 && normY >= 0 && normY <= 1) {
      send({
        type: "cursor",
        clientId,
        name: usernameEl.value || "Guest",
        x: normX,
        y: normY,
        color: "#2563EB",
      });
    }
  });

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
      ctx.strokeStyle = color || "#ffffff";
    }

    ctx.beginPath();
    ctx.moveTo(from.x * canvas.width, from.y * canvas.height);
    ctx.lineTo(to.x * canvas.width, to.y * canvas.height);
    ctx.stroke();
    ctx.restore();
  }

  // local drawing
  function posFromEvent(e) {
    // invert transform
    const rect = boardWrap.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    // to 0-1 logic space
    const worldX = (relX - panX) / scale;
    const worldY = (relY - panY) / scale;

    return {
      x: worldX / canvas.width,
      y: worldY / canvas.height,
    };
  }

  // pointer events
  boardWrap.addEventListener("pointerdown", (e) => {
    // ui click check
    if (
      e.target.closest(".btn-tool") ||
      e.target.closest("#sidebar") ||
      e.target.closest(".popup-menu") ||
      e.target.closest(".zoom-controls") ||
      e.target.closest("#top-bar")
    )
      return;

    if (tool === "pan") {
      isPanning = true;
      lastPan = { x: e.clientX, y: e.clientY };
      boardWrap.setPointerCapture(e.pointerId);
      boardWrap.style.cursor = "grabbing";
      e.preventDefault();
      return;
    }

    // skip if dragging
    if (e.target.closest(".element-item")) return;

    drawing = true;
    last = posFromEvent(e);
    e.preventDefault(); // prevent scroll
  });

  window.addEventListener("pointerup", (e) => {
    drawing = false;
    last = null;
    if (isPanning) {
      isPanning = false;
      try {
        boardWrap.releasePointerCapture(e.pointerId);
      } catch (e) {}
      boardWrap.style.cursor = "default";
      if (tool === "pan") boardWrap.style.cursor = "grab";
    }
  });

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

    drawSegment({ from: last, to: p, color, size, toolType: tool }, true);
    send({
      type: "draw",
      clientId,
      from: last,
      to: p,
      color,
      size,
      toolType: tool,
    });
    last = p;
  });

  // switch tools
  function setActiveTool(t, btn) {
    if (tool === t && btn.classList.contains("active")) {
      if (t === "pen") penMenu.classList.toggle("hidden");
      if (t === "eraser") eraserMenu.classList.toggle("hidden");
      return;
    }
    penMenu.classList.add("hidden");
    eraserMenu.classList.add("hidden");

    tool = t;
    document
      .querySelectorAll(".btn-tool")
      .forEach((b) => b.classList.remove("active"));
    if (btn) btn.classList.add("active");

    boardWrap.style.cursor = t === "pan" ? "grab" : "crosshair";
  }

  penBtn.addEventListener("click", () => setActiveTool("pen", penBtn));
  eraserBtn.addEventListener("click", () => setActiveTool("eraser", eraserBtn));
  panBtn.addEventListener("click", () => setActiveTool("pan", panBtn));

  // custom colors
  customColorPicker.addEventListener("input", (e) => {
    currentColor = e.target.value;
    // deselect others
    colorSwatches.forEach((s) => s.classList.remove("active"));
    const label = document.querySelector(".custom-color-label");
    label.style.background = currentColor;
    label.classList.add("active");
  });

  colorSwatches.forEach((swatch) => {
    swatch.addEventListener("click", () => {
      colorSwatches.forEach((s) => s.classList.remove("active"));
      // clear custom
      document.querySelector(".custom-color-label").classList.remove("active");

      swatch.classList.add("active");
      currentColor = swatch.dataset.color;
    });
  });

  penSizeSlider.addEventListener(
    "input",
    (e) => (currentSize = parseInt(e.target.value, 10)),
  );
  eraserSizeSlider.addEventListener(
    "input",
    (e) => (currentEraserSize = parseInt(e.target.value, 10)),
  );

  // zoom
  zoomInBtn.addEventListener("click", () => {
    scale += 0.1;
    updateViewport();
  });
  zoomOutBtn.addEventListener("click", () => {
    if (scale > 0.2) scale -= 0.1;
    updateViewport();
  });

  clearBtn.addEventListener("click", () => {
    if (confirm("Clear board?")) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      send({ type: "clear", clientId });
      filesLayer.innerHTML = "";
    }
  });

  if (shareBtn)
    shareBtn.addEventListener("click", () =>
      alert("Sharing functionality coming soon!"),
    );

  // create elements
  function addElement(type, args) {
    const id = Math.random().toString(36).slice(2, 9);
    // spawn center
    const rect = boardWrap.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const worldX = (centerX - panX) / scale;
    const worldY = (centerY - panY) / scale; 

    const msg = {
      type: "element",
      kind: type,
      clientId,
      id,
      left: worldX - 50,
      top: worldY - 20,
      ...args,
    };
    insertElement(msg);
    send(msg);
  }

  addNoteBtn.addEventListener("click", () =>
    addElement("sticky", { content: "New Note" }),
  );
  addCardBtn.addEventListener("click", () =>
    addElement("card", { title: "Title", content: "Details" }),
  );
  if (addTextBtn)
    addTextBtn.addEventListener("click", () =>
      addElement("text", { content: "Text" }),
    );

  fileInput.addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      addElement("image", { name: f.name, data: reader.result });
    };
    reader.readAsDataURL(f);
  });

  // insert element
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

    // drag handle
    const dragHandle = document.createElement("div");
    dragHandle.className = "drag-handle";
    wrap.appendChild(dragHandle);

    // content
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
        send({
          type: "element-update",
          clientId,
          id: msg.id,
          content: content.innerText,
        });
      });
    } else if (msg.kind === "card") {
      const header = document.createElement("div");
      header.className = "card-header";
      header.innerHTML = `<span>${msg.title || "Title"}</span>`;
      // header as handle
      header.style.cursor = "grab";
      dragHandle.style.display = "none"; // hide generic
      header.classList.add("custom-drag-handle");

      wrap.appendChild(header);

      const body = document.createElement("div");
      body.className = "card-body";
      body.contentEditable = true;
      body.innerText = msg.content || "Description";
      wrap.appendChild(body);

      body.addEventListener("input", () => {
        send({
          type: "element-update",
          clientId,
          id: msg.id,
          content: body.innerText,
        });
      });
    }

    // resize handle
    const resize = document.createElement("div");
    resize.className = "resize-handle";
    resize.style.position = "absolute";
    resize.style.right = "0";
    resize.style.bottom = "0";
    resize.style.width = "16px";
    resize.style.height = "16px";
    resize.style.cursor = "nwse-resize";
    resize.style.background = "rgba(0,0,0,0.2)"; 
    resize.style.zIndex = "20";
    wrap.appendChild(resize);

    // setup interactions
    makeDraggableResizable(wrap, dragHandle, resize);

    // card header trigger
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

      // handle resize
      if (e.target === resizeTrigger) {
        e.preventDefault();
        e.stopPropagation();
        resizing = true;
        resizeTrigger.setPointerCapture(e.pointerId);
        startX = e.clientX;

        // start width
        startW = parseFloat(el.style.width) || el.offsetWidth;

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        return;
      }

      // handle drag
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

        // start pos
        startLeft = parseFloat(el.style.left) || 0;
        startTop = parseFloat(el.style.top) || 0;

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      }
    }

    function onMove(e) {
      if (dragging) {
        // screen delta
        const dxScreen = e.clientX - startX;
        const dyScreen = e.clientY - startY;
        // world delta
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
      if (dragging) {
        dragging = false;
        try {
          dragTrigger.releasePointerCapture(e.pointerId);
        } catch (e) {}
        el.classList.remove("dragging");
        const id = el.getAttribute("data-id");
        send({
          type: "element-update",
          clientId,
          id,
          left: parseFloat(el.style.left),
          top: parseFloat(el.style.top),
        });
      }
      if (resizing) {
        resizing = false;
        try {
          resizeTrigger.releasePointerCapture(e.pointerId);
        } catch (e) {}
        const id = el.getAttribute("data-id");
        send({
          type: "element-update",
          clientId,
          id,
          width: parseFloat(el.style.width),
        });
      }
      // cleanup
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    if (dragTrigger) dragTrigger.addEventListener("pointerdown", onDown);
    if (resizeTrigger) resizeTrigger.addEventListener("pointerdown", onDown);
  }

  // tabs
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      if (tab === "notes") {
        notesPanel.style.display = "flex";
        chatPanel.style.display = "none";
      } else {
        notesPanel.style.display = "none";
        chatPanel.style.display = "flex";
      }
    });
  });

  window.addEventListener("beforeunload", () => {
    send({ type: "leave", clientId });
  });
})();
