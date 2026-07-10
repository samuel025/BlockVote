from flask import Flask, jsonify
from flask_cors import CORS
import serial
import adafruit_fingerprint
import hashlib
import time

app = Flask(__name__)
CORS(app) # Allow the React app to communicate with this server

# Initialize UART connection to the JM-101B sensor
# If using a USB-to-Serial adapter, it might be /dev/ttyUSB0
# If using the Pi's native GPIO pins (Tx=Pin 8, Rx=Pin 10), it is usually /dev/serial0
try:
    uart = serial.Serial("/dev/serial0", baudrate=57600, timeout=1)
    finger = adafruit_fingerprint.Adafruit_Fingerprint(uart)
    print("JM-101B Fingerprint Sensor Connected!")
except Exception as e:
    print(f"Failed to connect to sensor. Check wiring: {e}")
    finger = None

@app.route('/scan', methods=['GET'])
def scan_fingerprint():
    if not finger:
        return jsonify({"error": "Sensor hardware not initialized"}), 500

    print("Waiting for finger...")
    
    # 1. Wait until a finger is placed on the sensor
    while finger.get_image() != adafruit_fingerprint.OK:
        time.sleep(0.1)
        pass
        
    print("Finger captured. Processing...")
    
    # 2. Convert the captured image to a feature template (tz=1)
    if finger.image_2_tz(1) != adafruit_fingerprint.OK:
        return jsonify({"error": "Failed to extract fingerprint features"}), 400
        
    # 3. Create a unique hash of the fingerprint template
    # Since downloading the raw template takes longer, an easier way for this prototype
    # is to attempt to match it or generate a reproducible hash from the sensor's memory.
    # For a pure "mock-to-real" drop in, we extract the raw bytes from the buffer:
    
    try:
        # Load the template from the character buffer back to the host
        # Note: Depending on the specific library version, getting the raw template data
        # can be done via finger.get_fpdata(sensorbuffer="char")
        data = finger.get_fpdata(sensorbuffer="char")
        
        # Hash the raw byte data
        hasher = hashlib.sha256()
        hasher.update(bytearray(data))
        
        # 4. Truncate/format the hash to fit inside the BN128 curve field used by SnarkJS (31 bytes max)
        final_hash = int(hasher.hexdigest(), 16) % (2**253)
        print(f"Successfully generated biometric hash: {final_hash}")
        
        return jsonify({"success": True, "hash": str(final_hash)})
        
    except Exception as e:
        print(f"Error extracting raw template: {e}")
        return jsonify({"error": "Failed to read raw fingerprint data"}), 500

if __name__ == '__main__':
    # Run the server on the Raspberry Pi's localhost so the local Chromium browser can access it
    app.run(host='127.0.0.1', port=5000)
