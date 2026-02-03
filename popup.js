// ============ STATUS DISPLAY ============
function showStatus(message, type = "info") {
  const status = document.getElementById("status");
  status.textContent = message;
  status.className = type;
}

// ============ EXPORT FUNCTIONS ============
function formatCookiesForExport(cookies) {
  let content = "# Netscape HTTP Cookie File\n";
  content += "# Exported by Cookie Manager Extension\n";
  content += "# Format: domain, httpOnly, path, secure, expiry, name, value\n\n";
  
  cookies.forEach(cookie => {
    const domain = cookie.domain.startsWith('.') ? cookie.domain : '.' + cookie.domain;
    const httpOnly = cookie.httpOnly ? "TRUE" : "FALSE";
    const path = cookie.path || "/";
    const secure = cookie.secure ? "TRUE" : "FALSE";
    const expiry = cookie.expirationDate ? Math.floor(cookie.expirationDate) : 0;
    
    content += `${domain}\t${httpOnly}\t${path}\t${secure}\t${expiry}\t${cookie.name}\t${cookie.value}\n`;
  });
  
  return content;
}

function downloadCookies(cookies, filename) {
  if (cookies.length === 0) {
    showStatus("No cookies found to export.", "error");
    return;
  }
  
  const content = formatCookiesForExport(cookies);
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  
  URL.revokeObjectURL(url);
  showStatus(`Exported ${cookies.length} cookies!`, "success");
}

// Export all cookies
document.getElementById("exportAll").addEventListener("click", () => {
  chrome.cookies.getAll({}, (cookies) => {
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadCookies(cookies, `all_cookies_${timestamp}.txt`);
  });
});

// Export current site cookies
document.getElementById("exportCurrent").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    try {
      const url = new URL(tabs[0].url);
      chrome.cookies.getAll({ domain: url.hostname }, (cookies) => {
        downloadCookies(cookies, `${url.hostname}_cookies.txt`);
      });
    } catch (e) {
      showStatus("Cannot export cookies from this page.", "error");
    }
  });
});

// ============ IMPORT FUNCTIONS ============
function parseCookieFile(content) {
  const cookies = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || line.trim() === '') {
      continue;
    }
    
    const parts = line.split('\t');
    
    if (parts.length >= 7) {
      let domain = parts[0].trim();
      const httpOnly = parts[1].trim().toUpperCase() === "TRUE";
      const path = parts[2].trim() || "/";
      const secure = parts[3].trim().toUpperCase() === "TRUE";
      const expiry = parseInt(parts[4].trim());
      const name = parts[5].trim();
      const value = parts.slice(6).join('\t').trim(); // Handle values with tabs
      
      // Build cookie object
      const cookie = {
        name: name,
        value: value,
        domain: domain,
        path: path,
        secure: secure,
        httpOnly: httpOnly
      };
      
      // Add expiration if valid (0 = session cookie)
      if (expiry > 0) {
        cookie.expirationDate = expiry;
      }
      
      cookies.push(cookie);
    }
  }
  
  return cookies;
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

function handleFileImport(filterToCurrentDomain = false) {
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
      
      if (filterToCurrentDomain) {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
          try {
            const url = new URL(tabs[0].url);
            await importCookies(cookies, url.hostname);
          } catch (e) {
            showStatus("Cannot import to this page.", "error");
          }
        });
      } else {
        await importCookies(cookies);
      }
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

// Import all cookies from file
document.getElementById("importBtn").addEventListener("click", () => {
  handleFileImport(false);
});

// Import only cookies matching current domain
document.getElementById("importCurrentDomain").addEventListener("click", () => {
  handleFileImport(true);
});

// ============ MANAGE FUNCTIONS ============
document.getElementById("clearCurrent").addEventListener("click", () => {
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
