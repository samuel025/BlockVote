from flask import Flask, jsonify
from flask_cors import CORS
import time

app = Flask(__name__)
CORS(app) # CRITICAL: This allows your hosted Vercel frontend to talk to this local script!

# Initialize JM-101 / AS608 Fingerprint Sensor here
import serial
import adafruit_fingerprint

# UART configuration for Raspberry Pi GPIO pins (TX=14, RX=15)
uart = serial.Serial("/dev/serial0", baudrate=57600, timeout=1)
finger = adafruit_fingerprint.Adafruit_Fingerprint(uart)

@app.route('/scan', methods=['GET'])
def scan_fingerprint():
    """
    Called by your Vercel React frontend during voting.
    Tells the JM-101 sensor to wait for a finger and match it against memory.
    """
    # ------------------------------------------------------------------
    # ACTUAL HARDWARE LOGIC 
    # ------------------------------------------------------------------
    print("Waiting for finger...")
    while finger.get_image() != adafruit_fingerprint.OK:
        pass
    
    print("Finger imaged!")
    if finger.image_2_tz(1) != adafruit_fingerprint.OK:
        return jsonify({"error": "Failed to convert image"}), 400
    
    if finger.finger_search() != adafruit_fingerprint.OK:
        return jsonify({"error": "Fingerprint not found in sensor database"}), 404
    
    matched_id = finger.finger_id
    # We use the matched ID to generate a consistent hash seed for the ZK-Proof
    secret_seed = f"secret-biometric-hash-for-id-{matched_id}"
    
    print(f"Match found! ID: {matched_id}")
    return jsonify({"success": True, "secret": secret_seed})

if __name__ == '__main__':
    print("🚀 Hardware Bridge Running on port 5000")
    print("Your Vercel frontend can now securely talk to the hardware!")
    app.run(host='127.0.0.1', port=5000)

