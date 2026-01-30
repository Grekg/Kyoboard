/**
 * Configuration for Kyoboard application
 * Automatically detects environment and sets appropriate API URLs
 */

(function () {
  // Detect if we're in production (not localhost)
  const isProduction =
    !window.location.hostname.includes("localhost") &&
    !window.location.hostname.includes("127.0.0.1");

  // Production URL - Update this to your DigitalOcean domain
  const PRODUCTION_API = window.location.origin;
  const PRODUCTION_SOCKET = window.location.origin;

  // Development URLs
  const DEV_API = "http://localhost:3000";
  const DEV_SOCKET = "http://localhost:3000";

  // Export configuration
  window.KYOBOARD_CONFIG = {
    API_BASE: isProduction ? `${PRODUCTION_API}/api` : `${DEV_API}/api`,
    SOCKET_URL: isProduction ? PRODUCTION_SOCKET : DEV_SOCKET,
    IS_PRODUCTION: isProduction,
  };

  console.log(
    `Kyoboard running in ${isProduction ? "PRODUCTION" : "DEVELOPMENT"} mode`,
  );
  console.log("API Base:", window.KYOBOARD_CONFIG.API_BASE);
})();
