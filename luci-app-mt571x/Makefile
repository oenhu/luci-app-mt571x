include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-mt571x
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_LICENSE:=GPL-3.0

LUCI_TITLE:=LuCI Support for TD Tech MT5710/MT5711 5G/4G Band Lock & AT Control
LUCI_DEPENDS:=+kmod-usb-serial-option +jq
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
