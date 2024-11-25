function getBrowserEngineInfo() {
  const userAgent = navigator.userAgent;
  let engineInfo = {
    engine: "",
    version: "",
    os: "",
    osVersion: "",
  };

  const isIOS = /iPad|iPhone|iPod/.test(userAgent);

  if (/CriOS\/([\d.]+)/.test(userAgent)) {
    // Chrome browser on iOS
    const versionMatch = userAgent.match(/CriOS\/([\d.]+)/);
    engineInfo = {
      engine: "Chrome iOS",
      version: versionMatch ? versionMatch[1] : "unknown",
      os: "iOS",
      osVersion: getiOSVersion() || "",
    };
  } else if (/FxiOS\/([\d.]+)/.test(userAgent)) {
    // Firefox browser on iOS
    const versionMatch = userAgent.match(/FxiOS\/([\d.]+)/);
    engineInfo = {
      engine: "Firefox iOS",
      version: versionMatch ? versionMatch[1] : "unknown",
      os: "iOS",
      osVersion: getiOSVersion() || "",
    };
  } else if (userAgent.includes("EdgiOS")) {
    // Edge browser on iOS
    const versionMatch = userAgent.match(
      /EdgiOS\/([\d.]+)/,
    );
    engineInfo = {
      engine: "Edge iOS",
      version: versionMatch ? versionMatch[1] : "unknown",
      os: "iOS",
      osVersion: getiOSVersion() || "",
    };
  } else if (userAgent.includes("OPiOS")) {
    // Opera browser on iOS
    const versionMatch = userAgent.match(/OPiOS\/([\d.]+)/);
    engineInfo = {
      engine: "Opera iOS",
      version: versionMatch ? versionMatch[1] : "unknown",
      os: "iOS",
      osVersion: getiOSVersion() || "",
    };
  } else if (
    userAgent.includes("Safari") &&
    !userAgent.includes("Chrome")
  ) {
    // Safari browser
    const versionMatch = userAgent.match(
      /Version\/([\d.]+)/,
    );
    engineInfo = {
      engine: "Safari",
      version: versionMatch ? versionMatch[1] : "unknown",
      os: isIOS ? "iOS" : "macOS",
      osVersion: isIOS ? getiOSVersion() || "" : "",
    };
  } else if (
    userAgent.includes("Chrome") &&
    userAgent.includes("Safari")
  ) {
    // Desktop Chrome browser
    const versionMatch = userAgent.match(
      /Chrome\/([\d.]+)/,
    );
    engineInfo = {
      engine: "Chrome",
      version: versionMatch ? versionMatch[1] : "unknown",
      os: "",
      osVersion: "",
    };
  } else if (userAgent.includes("Firefox")) {
    // Desktop Firefox browser
    const versionMatch = userAgent.match(
      /Firefox\/([\d.]+)/,
    );
    engineInfo = {
      engine: "Firefox",
      version: versionMatch ? versionMatch[1] : "unknown",
      os: "",
      osVersion: "",
    };
  } else if (userAgent.includes("Edge")) {
    // Edge browser
    const versionMatch = userAgent.match(/Edg\/([\d.]+)/);
    engineInfo = {
      engine: "Edge",
      version: versionMatch ? versionMatch[1] : "unknown",
      os: "",
      osVersion: "",
    };
  } else if (userAgent.includes("Opera")) {
    // Opera browser
    const versionMatch = userAgent.match(/OPR\/([\d.]+)/);
    engineInfo = {
      engine: "Opera",
      version: versionMatch ? versionMatch[1] : "unknown",
      os: "",
      osVersion: "",
    };
  }

  return engineInfo;
}

function getiOSVersion() {
  const userAgent =
    // @ts-ignore
    navigator.userAgent || navigator.vendor || window.opera;
  const iOSMatch = userAgent.match(
    /OS (\d+)[_.](\d+)(?:[_.](\d+))?/,
  );
  if (iOSMatch && iOSMatch.length > 2) {
    const major = parseInt(iOSMatch[1], 10);
    const minor = parseInt(iOSMatch[2], 10);
    const patch = iOSMatch[3]
      ? parseInt(iOSMatch[3], 10)
      : 0;
    return `${major}.${minor}.${patch}`;
  }
  return null;
}

function compareVersions(current: string, target: string) {
  const currentParts = current.split(".").map(Number);
  const targetParts = target.split(".").map(Number);

  for (
    let i = 0;
    i < Math.max(currentParts.length, targetParts.length);
    i++
  ) {
    const currentPart = currentParts[i] || 0;
    const targetPart = targetParts[i] || 0;

    if (currentPart < targetPart) return false;
    if (currentPart > targetPart) return true;
  }
  return true; // Returns true when version numbers are equal
}

export function checkBrowserSupport() {
  const { engine, version, os, osVersion } =
    getBrowserEngineInfo();

  if (os === "iOS") {
    const minIOSVersion = "13.0";
    return (
      osVersion && compareVersions(osVersion, minIOSVersion)
    );
  } else {
    const minVersions: Record<string, string> = {
      Chrome: "66",
      Firefox: "63",
      Safari: "13",
      Edge: "79", // Edge based on Chromium
      Opera: "53",
    };

    return (
      engine &&
      version &&
      minVersions[engine] &&
      compareVersions(version, minVersions[engine])
    );
  }
}

export function isWebRTCAvailable() {
  return (
    "RTCPeerConnection" in window ||
    "webkitRTCPeerConnection" in window ||
    "mozRTCPeerConnection" in window
  );
}
