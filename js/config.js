// app config

(function () {
  // check if prod
  const isProduction =
    !window.location.hostname.includes("localhost") &&
    !window.location.hostname.includes("127.0.0.1");

  // prod urls
  const PRODUCTION_API = window.location.origin;
  const PRODUCTION_SOCKET = window.location.origin;

  // dev urls
  const DEV_API = "http://localhost:3000";
  const DEV_SOCKET = "http://localhost:3000";

  // export config
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
