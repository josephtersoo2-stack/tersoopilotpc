import os
import sys
import urllib.request
import zipfile
import hashlib
import shutil

URL = "https://github.com/heretic-tech/apostate/releases/download/v0.5.1/apostate-155.0.8059.31-windows-x64.zip"
EXPECTED_SHA256 = "8e55e44fb7f58619461e1d42a947446dcc08a2b46493c420c8e62ae27ab9c7e5"

LOCAL_APPDATA = os.environ.get("LOCALAPPDATA", r"C:\Users\Akende Micheal\AppData\Local")
CACHE_DIR = os.path.join(LOCAL_APPDATA, "apostate", "cache")
TARGET_DIR = os.path.join(CACHE_DIR, "155.0.8059.31", "windows-x64")
INSTALL_DIR = os.path.join(TARGET_DIR, "install")
ZIP_PATH = os.path.join(CACHE_DIR, "apostate-155.0.8059.31-windows-x64.zip")

os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(INSTALL_DIR, exist_ok=True)

print(f"Target install dir: {INSTALL_DIR}")

# Check if already installed
chrome_exe = os.path.join(INSTALL_DIR, "chrome.exe")
if os.path.exists(chrome_exe):
    print(f"Found chrome.exe already at {chrome_exe}")
    sys.exit(0)

# Download zip if not already downloaded or hash mismatch
need_download = True
if os.path.exists(ZIP_PATH):
    h = hashlib.sha256()
    with open(ZIP_PATH, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    if h.hexdigest() == EXPECTED_SHA256:
        print("Archive already downloaded and SHA256 verified.")
        need_download = False
    else:
        print("Existing archive has mismatched hash. Re-downloading...")
        os.remove(ZIP_PATH)

if need_download:
    print(f"Downloading {URL}...")
    headers = {'User-Agent': 'Mozilla/5.0'}
    req = urllib.request.Request(URL, headers=headers)
    with urllib.request.urlopen(req) as resp, open(ZIP_PATH, "wb") as out:
        total = int(resp.headers.get("content-length", 0))
        downloaded = 0
        last_pct = -1
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
            downloaded += len(chunk)
            if total > 0:
                pct = int(downloaded * 100 / total)
                if pct != last_pct and pct % 10 == 0:
                    print(f"Downloaded {pct}% ({downloaded // (1024*1024)}MB / {total // (1024*1024)}MB)")
                    last_pct = pct

    # Verify hash
    h = hashlib.sha256()
    with open(ZIP_PATH, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    digest = h.hexdigest()
    if digest != EXPECTED_SHA256:
        print(f"ERROR: SHA256 mismatch! Got {digest}, expected {EXPECTED_SHA256}")
        sys.exit(1)
    print("SHA256 verified successfully!")

print(f"Extracting {ZIP_PATH} to {INSTALL_DIR}...")
with zipfile.ZipFile(ZIP_PATH, 'r') as zip_ref:
    zip_ref.extractall(INSTALL_DIR)

# Check extracted files
print(f"Contents of {INSTALL_DIR}:")
for item in os.listdir(INSTALL_DIR):
    print(f"  {item}")

# If zip had a top-level directory like apostate-155... or chrome-win, check it
for item in os.listdir(INSTALL_DIR):
    subpath = os.path.join(INSTALL_DIR, item)
    if os.path.isdir(subpath) and os.path.exists(os.path.join(subpath, "chrome.exe")):
        print(f"Moving contents from {subpath} directly into {INSTALL_DIR}...")
        for subitem in os.listdir(subpath):
            src = os.path.join(subpath, subitem)
            dst = os.path.join(INSTALL_DIR, subitem)
            if os.path.exists(dst):
                if os.path.isdir(dst):
                    shutil.rmtree(dst)
                else:
                    os.remove(dst)
            shutil.move(src, dst)
        os.rmdir(subpath)
        break

if os.path.exists(os.path.join(INSTALL_DIR, "chrome.exe")):
    print(f"SUCCESS: Apostate installed at {os.path.join(INSTALL_DIR, 'chrome.exe')}")
else:
    print(f"Warning: chrome.exe not found directly in {INSTALL_DIR}")
