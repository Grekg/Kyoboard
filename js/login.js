(() => {
  const API_BASE =
    window.KYOBOARD_CONFIG?.API_BASE || "http://localhost:3000/api";

  const form = document.querySelector(".login-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const submitBtn = form.querySelector('button[type="submit"]');
  const footerText = document.querySelector(".footer-text");

  // Check if we need to add signup fields
  let isSignupMode = false;

  // Check if already logged in
  checkAuth();

  async function checkAuth() {
    try {
      const token = localStorage.getItem("kyoboard_token");
      if (!token) return; // No token, stay on login page

      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (res.ok) {
        window.location.href = "dashboard.html";
      }
    } catch (e) {
      // Not logged in, stay on page
    }
  }

  // Toggle between login and signup
  const signupLink = footerText?.querySelector(".link-highlight");
  if (signupLink) {
    signupLink.addEventListener("click", (e) => {
      e.preventDefault();
      toggleSignupMode();
    });
  }

  function toggleSignupMode() {
    isSignupMode = !isSignupMode;

    const heading = document.querySelector(".login-card h1");
    const subtext = document.querySelector(".login-card p");

    if (isSignupMode) {
      heading.textContent = "Create Account";
      subtext.textContent = "Join Kyoboard and start collaborating.";
      submitBtn.textContent = "Sign Up";
      footerText.innerHTML =
        'Already have an account? <a href="#" class="link-highlight">Log In</a>';

      // Add username field if not present
      if (!document.getElementById("username")) {
        const usernameGroup = document.createElement("div");
        usernameGroup.className = "form-group";
        usernameGroup.id = "username-group";
        usernameGroup.innerHTML = `
          <label for="username" class="form-label">Username</label>
          <input type="text" id="username" class="form-input" placeholder="Choose a username" required />
        `;
        form.insertBefore(usernameGroup, form.firstChild);
      }
    } else {
      heading.textContent = "Welcome Back";
      subtext.textContent = "Log in to collaborate with your team.";
      submitBtn.textContent = "Log In";
      footerText.innerHTML =
        'Don\'t have an account? <a href="#" class="link-highlight">Request Access</a>';

      // Remove username field
      const usernameGroup = document.getElementById("username-group");
      if (usernameGroup) usernameGroup.remove();
    }

    // Re-attach link listener
    const newLink = footerText.querySelector(".link-highlight");
    newLink.addEventListener("click", (e) => {
      e.preventDefault();
      toggleSignupMode();
    });
  }

  // Form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const usernameEl = document.getElementById("username");
    const username = usernameEl?.value.trim();

    // Validation
    if (!email || !password) {
      showError("Please fill in all fields");
      return;
    }

    if (isSignupMode && !username) {
      showError("Please enter a username");
      return;
    }

    if (password.length < 6) {
      showError("Password must be at least 6 characters");
      return;
    }

    // Disable button
    submitBtn.disabled = true;
    submitBtn.textContent = isSignupMode
      ? "Creating Account..."
      : "Logging in...";

    try {
      const endpoint = isSignupMode ? "/auth/signup" : "/auth/login";
      const body = isSignupMode
        ? { username, email, password }
        : { email, password };

      console.log("Attempting auth:", endpoint, body);

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      console.log("Response status:", res.status);

      const data = await res.json();
      console.log("Response data:", data);

      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      // Store token and user info in localStorage
      if (data.token) {
        localStorage.setItem("kyoboard_token", data.token);
      }
      localStorage.setItem("kyoboard_user", JSON.stringify(data.user));

      console.log("Login successful, redirecting to dashboard...");
      // Redirect to dashboard
      window.location.href = "dashboard.html";
    } catch (error) {
      console.error("Auth error:", error);
      showError(error.message || "Network error - is the server running?");
      submitBtn.disabled = false;
      submitBtn.textContent = isSignupMode ? "Sign Up" : "Log In";
    }
  });

  function showError(message) {
    // Remove existing error
    const existing = document.querySelector(".error-message");
    if (existing) existing.remove();

    const errorDiv = document.createElement("div");
    errorDiv.className = "error-message";
    errorDiv.style.cssText = `
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #ef4444;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      font-size: 0.9rem;
    `;
    errorDiv.textContent = message;

    form.insertBefore(errorDiv, form.firstChild);

    // Auto-remove after 5 seconds
    setTimeout(() => errorDiv.remove(), 5000);
  }
})();
