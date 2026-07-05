"""Headless MPFB2 install for Blender.

Run:  blender --background --python scripts/setup-mpfb.py

Downloads the MPFB extension zip (hash-pinned, official Blender extensions
platform build of MPFB2) into scripts/vendor/ if missing, installs it, and
saves preferences so later headless runs can import it.

Note: MPFB2 switched from a legacy add-on to a Blender EXTENSION after
2024-10, so the modern install op is bpy.ops.extensions.package_install_files
(installed under the module namespace bl_ext.user_default.mpfb). The legacy
bpy.ops.preferences.addon_install path is kept as a fallback for old
Blender/MPFB combinations.
"""

import hashlib
import sys
import urllib.request
from pathlib import Path

import bpy

MPFB_VERSION = "2.0.16"
MPFB_SHA256 = "b5cdc8b08147e0c6463e4faa01147491b13a0b062f73415363f029debd11c934"
MPFB_URL = (
    "https://extensions.blender.org/download/"
    f"sha256:{MPFB_SHA256}/add-on-mpfb-v{MPFB_VERSION}.zip"
)

VENDOR_DIR = Path(__file__).resolve().parent / "vendor"
ZIP_PATH = VENDOR_DIR / f"mpfb-v{MPFB_VERSION}.zip"


def ensure_zip() -> None:
    VENDOR_DIR.mkdir(parents=True, exist_ok=True)
    if not ZIP_PATH.exists():
        print(f"downloading MPFB {MPFB_VERSION} ...")
        urllib.request.urlretrieve(MPFB_URL, ZIP_PATH)
    digest = hashlib.sha256(ZIP_PATH.read_bytes()).hexdigest()
    if digest != MPFB_SHA256:
        sys.exit(f"FATAL: checksum mismatch for {ZIP_PATH}: {digest}")
    print(f"zip ok: {ZIP_PATH}")


def install() -> None:
    try:
        bpy.ops.extensions.package_install_files(
            filepath=str(ZIP_PATH), repo="user_default", enable_on_install=True
        )
        print("installed as extension (bl_ext.user_default.mpfb)")
    except Exception as exc:  # noqa: BLE001 - report and try legacy path
        print(f"extension install failed ({exc}); trying legacy addon_install")
        bpy.ops.preferences.addon_install(filepath=str(ZIP_PATH))
        bpy.ops.preferences.addon_enable(module="mpfb")
        print("installed as legacy addon (mpfb)")
    bpy.ops.wm.save_userpref()
    print("preferences saved")


if __name__ == "__main__":
    ensure_zip()
    install()
