#!/bin/bash
# Kiosk Mode Setup Script for Raspberry Pi (Debian/X11)
# Run this script on the Raspberry Pi to lock it into Kiosk mode.

# 1. Update and install unclutter (hides the mouse cursor)
echo "Installing unclutter to hide mouse cursor..."
sudo apt-get update
sudo apt-get install -y unclutter

# 2. Setup the autostart configuration
AUTOSTART_FILE="/etc/xdg/lxsession/LXDE-pi/autostart"
echo "Configuring LXDE autostart at $AUTOSTART_FILE..."

# Backup the original autostart file just in case
sudo cp $AUTOSTART_FILE ${AUTOSTART_FILE}.backup

# Overwrite with the Kiosk configuration
sudo bash -c "cat > $AUTOSTART_FILE" << EOF
@lxpanel --profile LXDE-pi
@pcmanfm --desktop --profile LXDE-pi
# Disable screensaver and screen blanking
@xset s off
@xset -dpms
@xset s noblank
# Hide the mouse cursor after 0.1 seconds of inactivity
@unclutter -idle 0.1
# Launch Chromium in Kiosk mode pointing to the deployed voting app
# NOTE: Replace the URL below with your actual Brimble/Vercel URL!
@chromium-browser --noerrdialogs --disable-infobars --kiosk http://localhost:5173
EOF

echo "================================================="
echo "Kiosk Mode Configuration Complete!"
echo "Please edit the URL in $AUTOSTART_FILE to match your deployed Brimble URL."
echo "Then, reboot your Pi: sudo reboot"
echo "================================================="
