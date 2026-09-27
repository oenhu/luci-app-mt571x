#!/usr/bin/env python3
"""
build_ipk.py: Build standalone OpenWrt .ipk package for luci-app-mt571x
"""
import os
import sys
import tarfile
import io
import time

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
PKG_ROOT = os.path.join(PROJECT_DIR, "luci-app-mt571x", "root")
OUTPUT_IPK = os.path.join(PROJECT_DIR, "luci-app-mt571x_1.0.0-1_all.ipk")

def create_tar_gz_bytes(file_entries):
    """
    file_entries: list of (arcname, data_bytes, mode)
    """
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz", format=tarfile.GNU_FORMAT) as tar:
        for arcname, data, mode in file_entries:
            ti = tarfile.TarInfo(name=arcname)
            ti.size = len(data)
            ti.mtime = int(time.time())
            ti.mode = mode
            ti.uid = 0
            ti.gid = 0
            ti.uname = "root"
            ti.gname = "root"
            tar.addfile(ti, io.BytesIO(data))
    return buf.getvalue()

def build_ipk():
    print(f"Building {OUTPUT_IPK}...")

    # 1. Build data.tar.gz from luci-app-mt571x/root
    data_entries = []
    for root, dirs, files in os.walk(PKG_ROOT):
        for f in files:
            if f.startswith(".") or f.endswith("~"):
                continue
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, PKG_ROOT)
            arcname = "./" + rel_path

            with open(full_path, "rb") as fp:
                content = fp.read()

            mode = 0o644
            if "bin" in rel_path or "init.d" in rel_path or "hotplug.d" in rel_path or "rpcd" in rel_path:
                mode = 0o755

            data_entries.append((arcname, content, mode))

    data_tar_gz = create_tar_gz_bytes(data_entries)

    # 2. Build control.tar.gz
    control_content = b"""Package: luci-app-mt571x
Version: 1.0.0-1
Depends: libc, kmod-usb-serial-option, jq
Section: luci
Architecture: all
Maintainer: TD Tech Modem Community
Description: LuCI web application for TD Tech MT5710/MT5711 5G/4G Band/Cell Lock and AT Console
"""
    postinst_content = b"""#!/bin/sh
[ -n "$IPKG_INSTROOT" ] || {
    chmod +x /usr/bin/mt571x-at
    chmod +x /etc/init.d/mt571x
    chmod +x /etc/hotplug.d/usb/10-mt571x
    chmod +x /usr/libexec/rpcd/mt571x
    /etc/init.d/mt571x enable
    /etc/init.d/mt571x restart
    /etc/init.d/rpcd restart
    rm -rf /tmp/luci-*
    exit 0
}
"""
    prerm_content = b"""#!/bin/sh
[ -n "$IPKG_INSTROOT" ] || {
    /etc/init.d/mt571x stop
    /etc/init.d/mt571x disable
    exit 0
}
"""
    postrm_content = b"""#!/bin/sh
[ -n "$IPKG_INSTROOT" ] || {
    rm -rf /tmp/luci-*
    exit 0
}
"""
    control_entries = [
        ("./control", control_content, 0o644),
        ("./postinst", postinst_content, 0o755),
        ("./prerm", prerm_content, 0o755),
        ("./postrm", postrm_content, 0o755)
    ]
    control_tar_gz = create_tar_gz_bytes(control_entries)

    # 3. Build debian-binary
    debian_binary = b"2.0\n"

    # 4. Pack into .ipk (outer tar.gz)
    ipk_buf = io.BytesIO()
    with tarfile.open(OUTPUT_IPK, mode="w:gz", format=tarfile.GNU_FORMAT) as tar:
        # debian-binary
        ti = tarfile.TarInfo(name="./debian-binary")
        ti.size = len(debian_binary)
        ti.mtime = int(time.time())
        ti.mode = 0o644
        tar.addfile(ti, io.BytesIO(debian_binary))

        # data.tar.gz
        ti = tarfile.TarInfo(name="./data.tar.gz")
        ti.size = len(data_tar_gz)
        ti.mtime = int(time.time())
        ti.mode = 0o644
        tar.addfile(ti, io.BytesIO(data_tar_gz))

        # control.tar.gz
        ti = tarfile.TarInfo(name="./control.tar.gz")
        ti.size = len(control_tar_gz)
        ti.mtime = int(time.time())
        ti.mode = 0o644
        tar.addfile(ti, io.BytesIO(control_tar_gz))

    size = os.path.getsize(OUTPUT_IPK)
    print(f"Successfully created {OUTPUT_IPK} ({size} bytes)")

if __name__ == "__main__":
    build_ipk()
