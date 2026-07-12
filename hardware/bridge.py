from flask import Flask, jsonify
from flask_cors import CORS
import time
import serial
import adafruit_fingerprint

app = Flask(__name__)
CORS(app) # CRITICAL: This allows your hosted Vercel frontend to talk to this local script!

# UART configuration for Raspberry Pi GPIO pins (TX=14, RX=15)
uart = serial.Serial("/dev/serial0", baudrate=57600, timeout=1)
finger = adafruit_fingerprint.Adafruit_Fingerprint(uart)

def get_next_available_id():
    """Find the next empty slot in the sensor's database"""
    if finger.read_templates() != adafruit_fingerprint.OK:
        return 1
    templates = finger.templates
    for i in range(1, 128):
        if i not in templates:
            return i
    return -1

@app.route('/enroll/step1', methods=['GET'])
def enroll_step1():
    """Step 1: Scans the finger for the first time and saves to Buffer 1"""
    print("Step 1: Waiting for finger...")
    while finger.get_image() != adafruit_fingerprint.OK:
        pass
    
    if finger.image_2_tz(1) != adafruit_fingerprint.OK:
        return jsonify({"error": "Failed to convert image 1"}), 400
        
    return jsonify({"success": True, "message": "Image 1 captured. Please remove finger."})

@app.route('/enroll/step2', methods=['GET'])
def enroll_step2():
    """Step 2: Waits for removal, scans again, saves to Buffer 2, and creates the model"""
    print("Step 2: Waiting for finger removal...")
    while finger.get_image() == adafruit_fingerprint.OK:
        pass # Wait until finger is removed

    print("Step 2: Waiting for same finger again...")
    while finger.get_image() != adafruit_fingerprint.OK:
        pass
        
    if finger.image_2_tz(2) != adafruit_fingerprint.OK:
        return jsonify({"error": "Failed to convert image 2"}), 400

    print("Creating model...")
    if finger.create_model() != adafruit_fingerprint.OK:
        return jsonify({"error": "Fingerprints did not match"}), 400
        
    location = get_next_available_id()
    if location < 0:
        return jsonify({"error": "Sensor memory is full"}), 500

    print("Storing model...")
    if finger.store_model(location) != adafruit_fingerprint.OK:
        return jsonify({"error": "Failed to save fingerprint to sensor"}), 500

    secret_seed = f"secret-biometric-hash-for-id-{location}"
    return jsonify({"success": True, "secret": secret_seed})


@app.route('/verify', methods=['GET'])
def verify_fingerprint():
    """
    Called by the React frontend during VOTING.
    Scans the finger ONCE and searches the sensor database for a match.
    """
    print("Waiting for finger to verify...")
    while finger.get_image() != adafruit_fingerprint.OK:
        pass
    
    print("Finger imaged!")
    if finger.image_2_tz(1) != adafruit_fingerprint.OK:
        return jsonify({"error": "Failed to convert image"}), 400
    
    if finger.finger_search() != adafruit_fingerprint.OK:
        return jsonify({"error": "Fingerprint not found in sensor database (404)"}), 404
    
    matched_id = finger.finger_id
    secret_seed = f"secret-biometric-hash-for-id-{matched_id}"
    
    print(f"Match found! ID: {matched_id}")
    return jsonify({"success": True, "secret": secret_seed})

if __name__ == '__main__':
    print("🚀 Hardware Bridge Running on port 5000")
    print("Listening for /enroll and /verify commands...")
    app.run(host='127.0.0.1', port=5000)
