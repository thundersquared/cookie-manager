// ============ STATUS DISPLAY ============
function showStatus(message, type = "info") {
  const status = document.getElementById("status");
  status.textContent = message;
  status.className = type;
}

// ============ EXPORT FUNCTIONS ============
function formatCookiesForExport(cookies) {
  const exportData = {
    exportedAt: new Date().toISOString(),
    cookies: cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || "/",
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      expirationDate: cookie.expirationDate || null
    }))
  };
  
  return JSON.stringify(exportData, null, 2);
}

function downloadCookies(cookies, filename) {
  if (cookies.length === 0) {
    showStatus("No cookies found to export.", "error");
    return;
  }
  
  const content = formatCookiesForExport(cookies);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  
  URL.revokeObjectURL(url);
  showStatus(`Exported ${cookies.length} cookies!`, "success");
}

// Export current site cookies
document.getElementById("exportCurrent").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    try {
      const url = new URL(tabs[0].url);
      chrome.cookies.getAll({ domain: url.hostname }, (cookies) => {
        downloadCookies(cookies, `${url.hostname}_cookies.json`);
      });
    } catch (e) {
      showStatus("Cannot export cookies from this page.", "error");
    }
  });
});

// ============ IMPORT FUNCTIONS ============
function parseCookieFile(content) {
  try {
    const data = JSON.parse(content);
    
    if (!data.cookies || !Array.isArray(data.cookies)) {
      throw new Error("Invalid JSON format: missing cookies array");
    }
    
    return data.cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || "/",
      secure: cookie.secure || false,
      httpOnly: cookie.httpOnly || false,
      expirationDate: cookie.expirationDate || undefined
    }));
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${error.message}`);
  }
}

async function importCookies(cookies, filterDomain = null) {
  let successCount = 0;
  let failCount = 0;
  const errors = [];
  
  for (const cookie of cookies) {
    // Filter by domain if specified
    if (filterDomain) {
      const cookieDomain = cookie.domain.replace(/^\./, '');
      if (!filterDomain.includes(cookieDomain) && !cookieDomain.includes(filterDomain)) {
        continue;
      }
    }
    
    try {
      // Determine the URL for the cookie
      const protocol = cookie.secure ? "https://" : "http://";
      const domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
      const url = protocol + domain + cookie.path;
      
      // Prepare cookie details
      const cookieDetails = {
        url: url,
        name: cookie.name,
        value: cookie.value,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly
      };
      
      // Add domain (with leading dot for domain cookies)
      if (cookie.domain.startsWith('.')) {
        cookieDetails.domain = cookie.domain;
      }
      
      // Add expiration date if present
      if (cookie.expirationDate && cookie.expirationDate > 0) {
        cookieDetails.expirationDate = cookie.expirationDate;
      }
      
      // Set the cookie
      await chrome.cookies.set(cookieDetails);
      successCount++;
      
    } catch (error) {
      failCount++;
      errors.push(`${cookie.name}: ${error.message}`);
    }
  }
  
  if (failCount > 0) {
    showStatus(`Imported ${successCount} cookies. Failed: ${failCount}`, successCount > 0 ? "info" : "error");
    console.log("Import errors:", errors);
  } else {
    showStatus(`Successfully imported ${successCount} cookies!`, "success");
  }
}

function handleFileImport() {
  const fileInput = document.getElementById("fileInput");
  
  fileInput.onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      const content = e.target.result;
      const cookies = parseCookieFile(content);
      
      if (cookies.length === 0) {
        showStatus("No valid cookies found in file.", "error");
        return;
      }
      
      showStatus(`Importing ${cookies.length} cookies...`, "info");
      
      await importCookies(cookies, null);
    };
    
    reader.onerror = () => {
      showStatus("Error reading file.", "error");
    };
    
    reader.readAsText(file);
    
    // Reset file input for future imports
    fileInput.value = "";
  };
  
  fileInput.click();
}

// Import only cookies matching current domain
document.getElementById("importCurrentDomain").addEventListener("click", () => {
  handleFileImport();
});

// ============ MANAGE FUNCTIONS ============
document.getElementById("clearCurrent").addEventListener("click", () => {
  if (!confirm("Are you sure you want to clear all cookies for the current site? This action cannot be undone.")) {
    return;
  }
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    try {
      const url = new URL(tabs[0].url);
      
      chrome.cookies.getAll({ domain: url.hostname }, (cookies) => {
        if (cookies.length === 0) {
          showStatus("No cookies to clear.", "info");
          return;
        }
        
        let cleared = 0;
        cookies.forEach(cookie => {
          const protocol = cookie.secure ? "https://" : "http://";
          const cookieUrl = protocol + url.hostname + cookie.path;
          
          chrome.cookies.remove({
            url: cookieUrl,
            name: cookie.name
          }, () => {
            cleared++;
            if (cleared === cookies.length) {
              showStatus(`Cleared ${cleared} cookies!`, "success");
            }
          });
        });
      });
    } catch (e) {
      showStatus("Cannot clear cookies on this page.", "error");
    }
  });
});

// ============ PEER SYNC (NATIVE MESSAGING) ============
const NM_HOST = "com.thundersquared.cookiesync";

let nmPort = null;
let pollInterval = null;

function renderPeers(peers) {
  const list = document.getElementById("peer-list");
  const status = document.getElementById("peers-status");
  list.innerHTML = "";

  if (!peers || peers.length === 0) {
    status.textContent = "No peers found.";
    return;
  }

  status.textContent = "";
  peers.forEach(peer => {
    const li = document.createElement("li");

    const dot = document.createElement("span");
    dot.className = "peer-dot " + (peer.last_ip ? "reachable" : "known");

    const label = document.createElement("span");
    label.style.flex = "1";
    label.style.marginLeft = "2px";
    label.textContent = `${peer.hostname || peer.id.slice(0, 8)} · ${peer.profile || "Default"}`;

    const btn = document.createElement("button");
    btn.className = "peer-sync-btn";
    btn.textContent = "Push Cookies";
    btn.title = "Sync current site cookies to this peer";
    btn.addEventListener("click", () => syncToPeer(peer.id));

    li.appendChild(dot);
    li.appendChild(label);
    li.appendChild(btn);
    list.appendChild(li);
  });
}

function syncToPeer(peerId) {
  if (!nmPort) return;
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    try {
      const url = new URL(tabs[0].url);
      chrome.cookies.getAll({ domain: url.hostname }, cookies => {
        if (cookies.length === 0) {
          showStatus("No cookies to sync.", "error");
          return;
        }
        nmPort.postMessage({
          action: "push_cookies",
          peer_id: peerId,
          domain: url.hostname,
          cookies: cookies.map(c => ({
            name: c.name, value: c.value, domain: c.domain,
            path: c.path, secure: c.secure, httpOnly: c.httpOnly,
            expirationDate: c.expirationDate || null
          }))
        });
        showStatus(`Pushing ${cookies.length} cookies...`, "info");
      });
    } catch {
      showStatus("Cannot sync cookies from this page.", "error");
    }
  });
}

function connectNativeHost() {
  try {
    nmPort = chrome.runtime.connectNative(NM_HOST);
  } catch {
    document.getElementById("peers-status").textContent = "Install sync daemon to enable peer sync.";
    return;
  }

  nmPort.onDisconnect.addListener(() => {
    clearInterval(pollInterval);
    if (chrome.runtime.lastError) {
      document.getElementById("peers-status").textContent = "Install sync daemon to enable peer sync.";
    }
    nmPort = null;
  });

  nmPort.onMessage.addListener(response => {
    if (response.peers !== undefined) {
      renderPeers(response.peers);
    }
    if (response.ok === true) {
      showStatus("Cookies synced!", "success");
    }
    if (response.ok === false) {
      showStatus(`Sync failed: ${response.error}`, "error");
    }
    if (response.pending && response.pending.length > 0) {
      response.pending.forEach(batch => {
        importCookies(batch.cookies, batch.domain).then(() => {
          showStatus(`Received cookies from ${batch.from_hostname || batch.from_id.slice(0, 8)}`, "success");
        });
      });
    }
  });

  // Fetch peer list immediately.
  nmPort.postMessage({ action: "list_peers" });

  // Poll for incoming cookies every 2 seconds.
  pollInterval = setInterval(() => {
    if (nmPort) nmPort.postMessage({ action: "check_pending" });
  }, 2000);
}

connectNativeHost();
