#!/bin/sh
# Deploy luci-app-mt571x to OpenWrt router (192.168.1.1)

set -e

ROUTER_IP="${ROUTER_IP:-192.168.1.1}"
SSH_PORT="${SSH_PORT:-22}"

# Determine SSH Key
if [ -n "$CUSTOM_SSH_KEY" ] && [ -f "$CUSTOM_SSH_KEY" ]; then
    SSH_KEY="$CUSTOM_SSH_KEY"
elif [ -f "$(dirname "$0")/.ssh_key" ]; then
    SSH_KEY="$(dirname "$0")/.ssh_key"
elif [ -f "$HOME/.ssh/id_rsa" ]; then
    SSH_KEY="$HOME/.ssh/id_rsa"
else
    SSH_KEY=""
fi

LOCAL_PKG_ROOT="$(cd "$(dirname "$0")/luci-app-mt571x/root" && pwd)"

# Optional bind interface (e.g. multi-NIC environments)
BIND_IFACE="${BIND_IFACE:-en8}"
BIND_IP=$(ifconfig "$BIND_IFACE" 2>/dev/null | awk '/inet / {print $2}')
SSH_BIND_OPT=""
if [ -n "$BIND_IP" ]; then
    SSH_BIND_OPT="-b $BIND_IP"
fi

SSH_KEY_OPT=""
if [ -n "$SSH_KEY" ]; then
    SSH_KEY_OPT="-i $SSH_KEY"
fi

echo "==> Deploying luci-app-mt571x to $ROUTER_IP..."

# Copy files using scp / tar without Mac metadata files
COPYFILE_DISABLE=1 tar --exclude='._*' --exclude='.DS_Store' -C "$LOCAL_PKG_ROOT" -cf - . | ssh $SSH_BIND_OPT $SSH_KEY_OPT -p "$SSH_PORT" -o StrictHostKeyChecking=no root@$ROUTER_IP "tar -C / -xf - && echo 'Files unpacked successfully'"

# Set permissions and register services
ssh $SSH_BIND_OPT $SSH_KEY_OPT -p "$SSH_PORT" -o StrictHostKeyChecking=no root@$ROUTER_IP <<'REMOTE_EOF'
set -e
echo "==> Setting permissions..."
chmod +x /usr/bin/mt571x-at
chmod +x /etc/init.d/mt571x
chmod +x /etc/hotplug.d/usb/10-mt571x
chmod +x /usr/libexec/rpcd/mt571x

echo "==> Enabling and starting mt571x init service..."
/etc/init.d/mt571x enable
/etc/init.d/mt571x restart

echo "==> Restarting rpcd and clearing LuCI cache..."
/etc/init.d/rpcd restart
rm -rf /tmp/luci-*
sleep 2

echo "==> Verifying ubus registration..."
ubus list mt571x

echo "==> Testing mt571x status call..."
ubus call mt571x status
REMOTE_EOF

echo "==> Deployment completed successfully!"
